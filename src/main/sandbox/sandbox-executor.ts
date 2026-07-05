import { existsSync, readdirSync } from 'fs'
import { readFile, readdir, stat, writeFile } from 'fs/promises'
import { join, relative } from 'path'
import type {
  FilesystemToolIntent,
  GenericToolIntent,
  NetworkToolIntent,
  SandboxLimits,
  SandboxPolicy,
  ShellToolIntent,
  ToolIntent,
  ToolResult,
} from '@shared/types/sandbox.types'
import type { ApprovalDecision } from '@shared/types/approval.types'
import { ApprovalGate } from './approval-gate'
import { ChildProcessRunner } from './child-runner'
import { FilesystemScope } from './filesystem-scope'
import { loadLimits } from './limits'
import { loadSandboxPolicy } from './policy-loader'
import { parseNmapOutput } from './parsers/nmap.parser'
import { parseNetstatOutput, summarizeNetstatPorts } from './parsers/netstat.parser'
import { parseSecurityLog, summarizeSecurityLog } from './parsers/security-log.parser'
import { parseTasklistOutput, summarizeTasklistProcesses } from './parsers/tasklist.parser'
import {
  parseWindowsVersionOutput,
  summarizeWindowsVersion,
} from './parsers/windows-version.parser'
import { TcpPortProber } from './tcp-port-prober'
import { noopAuditSink, summarizeIntent, type SandboxAuditSink } from './audit'
import { normalizeCommand } from './command-normalizer'
import { resolveWatchdogTimeout } from './watchdog'
import { SECURITY_TOOLS, isToolAvailable, markToolUnavailable } from './tool-availability'
import { summarizeCurlOutput } from './parsers/curl.parser'

/** Anything that can turn an intent into a result. Lets the registry accept a coordinator. */
export interface IntentExecutor {
  execute(intent: ToolIntent): Promise<ToolResult>
}

/**
 * The sole authority allowed to trigger a runner. It evaluates policy, applies
 * limits and scope, dispatches to the correct runner, and audits every intent.
 * Tools never reach a runner except through here.
 */
export class SandboxExecutor implements IntentExecutor {
  constructor(
    private readonly approvalGate = new ApprovalGate(),
    private readonly childRunner = new ChildProcessRunner(),
    private readonly audit: SandboxAuditSink = noopAuditSink,
    private readonly limits: SandboxLimits = loadLimits(),
    private readonly scope: FilesystemScope = new FilesystemScope(),
    private readonly tcpPortProber: Pick<TcpPortProber, 'probe'> = new TcpPortProber(),
    private readonly sandboxPolicy: SandboxPolicy = loadSandboxPolicy()
  ) {}

  async execute(intent: ToolIntent): Promise<ToolResult> {
    const started = Date.now()
    const evaluation = this.approvalGate.evaluate(intent)

    let result: ToolResult
    if (evaluation.decision === 'deny') {
      result = this.makeImmediateResult(intent, started, 'denied', evaluation.reason)
    } else {
      // Preflight runs BEFORE approval so a missing binary/wordlist fails fast
      // with a clear observation instead of queuing a pointless approval.
      const preflight = this.preflightIntent(intent, started)
      if (preflight) {
        result = preflight
      } else if (evaluation.decision === 'needs_human_approval') {
        result = {
          ...this.makeImmediateResult(intent, started, 'requires_approval', evaluation.reason),
          needsApproval: true,
          approvalReason: evaluation.reason,
        }
      } else {
        result = await this.runAllowed(intent)
      }
    }

    result = this.attachIntentNotes(intent, result)
    this.recordAudit(intent, evaluation.decision, result)
    return result
  }

  /**
   * Availability + resource checks for shell intents that declare requirements.
   * Returns an error result to short-circuit, or null when preflight passes.
   */
  private preflightIntent(intent: ToolIntent, started: number): ToolResult | null {
    if (intent.kind !== 'shell') return null

    if (intent.requiresBinary && !isToolAvailable(intent.requiresBinary)) {
      const name = intent.requiresBinary
      const label = name.charAt(0).toUpperCase() + name.slice(1)
      return this.makeImmediateResult(
        intent,
        started,
        'error',
        `${label} is not installed or not on PATH. Install ${name} or configure tools.${name}.path before requesting approval.`
      )
    }

    for (const required of intent.requiresPaths ?? []) {
      const check = this.scope.check(required)
      if (!check.ok) {
        return this.makeImmediateResult(
          intent,
          started,
          'error',
          `Required file is out of the allowed scope: ${check.reason ?? required}`
        )
      }
      if (!existsSync(check.resolvedPath)) {
        return this.makeImmediateResult(
          intent,
          started,
          'error',
          `Required file not found in an allowed scope: ${required}. Provide an existing wordlist path before requesting approval.`
        )
      }
    }

    return null
  }

  private attachIntentNotes(intent: ToolIntent, result: ToolResult): ToolResult {
    if (!intent.notes?.length) return result
    return { ...result, metadata: { ...(result.metadata ?? {}), notes: intent.notes } }
  }

  /**
   * Runs an intent that a human has already approved, bypassing the gate.
   * Used by the approval coordinator once a queued request is granted.
   */
  async forceExecute(intent: ToolIntent): Promise<ToolResult> {
    const result = await this.runAllowed(intent)
    this.recordAudit(intent, 'allow', result)
    return result
  }

  private runAllowed(intent: ToolIntent): Promise<ToolResult> {
    const policyViolation = this.evaluateSandboxPolicy(intent)
    if (policyViolation) {
      const started = Date.now()
      return Promise.resolve(this.makeImmediateResult(intent, started, 'denied', policyViolation))
    }

    if (intent.kind === 'shell') return this.executeShell(intent)
    if (intent.kind === 'network') return this.executeNetwork(intent)
    if (intent.kind === 'filesystem') return this.executeFilesystem(intent)
    if (intent.kind === 'workspace') return Promise.resolve(this.executeWorkspace(intent))
    if (intent.kind === 'analysis') return Promise.resolve(this.executeAnalysis(intent))

    const started = Date.now()
    return Promise.resolve(
      this.makeImmediateResult(
        intent,
        started,
        'requires_approval',
        `${intent.kind} intent has no autonomous runner and must be handled by a human.`
      )
    )
  }

  private async executeShell(intent: ShellToolIntent): Promise<ToolResult> {
    const shellIntent = this.clampShell(intent)
    const result = await this.childRunner.run(shellIntent)
    const command = baseCommand(normalizeCommand(shellIntent.command, shellIntent.args).command)
    if (
      SECURITY_TOOLS.includes(command as (typeof SECURITY_TOOLS)[number]) &&
      isCommandUnavailable(result, command)
    ) {
      // Remember the miss so later prompts stop offering the tool this run.
      markToolUnavailable(command)
    }
    return this.compactShellObservation(shellIntent, result)
  }

  private async executeNetwork(intent: NetworkToolIntent): Promise<ToolResult> {
    if (intent.scanType === 'connect' || intent.scanType === 'http') {
      return this.executeTcpPortProbe(intent)
    }

    const ports = intent.ports?.length ? ['-p', intent.ports.join(',')] : []
    const scanFlags =
      intent.scanType === 'version' ? ['-sV'] : intent.scanType === 'syn' ? ['-sS'] : []
    const shellIntent: ShellToolIntent = {
      id: intent.id,
      kind: 'shell',
      command: 'nmap',
      args: [...scanFlags, ...ports, intent.target],
      timeoutMs: resolveWatchdogTimeout(intent, this.limits),
      reason: intent.reason,
      risk: intent.risk,
    }

    const result = await this.childRunner.run(shellIntent)
    if (isCommandUnavailable(result, 'nmap')) {
      markToolUnavailable('nmap')
      return this.executeTcpPortProbe(intent, 'nmap_unavailable')
    }

    const parsed = parseNmapOutput(result.stdout ?? '')
    if (parsed.length === 0) return { ...result, kind: 'network' }

    const summary = parsed
      .map((row) => `${row.port}/${row.protocol} ${row.state} ${row.service} ${row.version}`.trim())
      .join('\n')
    return {
      ...result,
      kind: 'network',
      observation: summary,
      metadata: { ...(result.metadata ?? {}), ports: parsed },
    }
  }

  private async executeTcpPortProbe(
    intent: NetworkToolIntent,
    fallbackReason?: string
  ): Promise<ToolResult> {
    const started = Date.now()
    const ports = intent.ports ?? []
    if (ports.length === 0) {
      return this.makeImmediateResult(
        intent,
        started,
        'error',
        'Fallback TCP interne impossible: aucun port cible fourni.'
      )
    }

    const timeoutMs = resolveWatchdogTimeout(intent, this.limits)
    const probes = await this.tcpPortProber.probe({ target: intent.target, ports, timeoutMs })
    const result = this.makeImmediateResult(
      intent,
      started,
      'success',
      summarizeTcpProbe(intent.target, probes)
    )
    return {
      ...result,
      metadata: {
        ...(result.metadata ?? {}),
        fallbackReason,
        tcpProbe: probes,
      },
    }
  }

  private compactShellObservation(intent: ShellToolIntent, result: ToolResult): ToolResult {
    const normalized = normalizeCommand(intent.command, intent.args)
    const command = baseCommand(normalized.command)

    if (command === 'curl' && (result.stdout || result.stderr)) {
      return {
        ...result,
        observation: summarizeCurlOutput(result.stdout ?? '', result.stderr ?? ''),
        metadata: { ...(result.metadata ?? {}), curlSummary: true },
      }
    }

    if (!result.stdout || result.status !== 'success') return result

    if (isCmdVer(command, normalized.args)) {
      const version = parseWindowsVersionOutput(result.stdout)
      return {
        ...result,
        observation: summarizeWindowsVersion(version),
        metadata: { ...(result.metadata ?? {}), windowsVersion: version },
      }
    }

    if (command === 'netstat') {
      const ports = parseNetstatOutput(result.stdout)
      if (ports.length === 0) return result
      return {
        ...result,
        observation: summarizeNetstatPorts(ports),
        metadata: { ...(result.metadata ?? {}), netstat: ports },
      }
    }

    if (command === 'tasklist') {
      const processes = parseTasklistOutput(result.stdout)
      if (processes.length === 0) return result
      return {
        ...result,
        observation: summarizeTasklistProcesses(processes),
        metadata: { ...(result.metadata ?? {}), tasklist: processes },
      }
    }

    return result
  }

  private async executeFilesystem(intent: FilesystemToolIntent): Promise<ToolResult> {
    const started = Date.now()
    const check = this.scope.check(intent.path)
    if (!check.ok) {
      return this.makeImmediateResult(
        intent,
        started,
        'denied',
        check.reason ?? 'Path out of scope.'
      )
    }

    const fullPath = check.resolvedPath
    const maxBytes = (intent.maxSizeMB ?? this.limits.maxFileSizeMB) * 1_048_576

    try {
      if (intent.mode === 'read') {
        const info = await stat(fullPath)
        // Reading a directory is a common agent mistake — return its listing
        // (like `mode: list`) instead of failing with EISDIR.
        if (info.isDirectory()) {
          const entries = await readdir(fullPath)
          return this.makeImmediateResult(
            intent,
            started,
            'success',
            `Directory ${fullPath} (${entries.length} entries):\n${entries.join('\n')}`
          )
        }
        if (info.size > maxBytes) {
          return this.makeImmediateResult(
            intent,
            started,
            'error',
            `File exceeds the ${Math.round(maxBytes / 1_048_576)}MB read limit (${info.size} bytes).`
          )
        }
        const content = await readFile(fullPath, 'utf-8')
        return this.makeImmediateResult(intent, started, 'success', content)
      }

      if (intent.mode === 'list') {
        const entries = await readdir(fullPath)
        return this.makeImmediateResult(intent, started, 'success', entries.join('\n'))
      }

      if (intent.mode === 'search') {
        const matches = await this.searchFilesystem(fullPath, intent)
        const patternText = normalizeSearchPatterns(intent.pattern).join(', ')
        const header = `Search ${fullPath}${patternText ? ` pattern=${patternText}` : ''} (${matches.length} match${matches.length === 1 ? '' : 'es'}):`
        return this.makeImmediateResult(
          intent,
          started,
          'success',
          matches.length ? `${header}\n${matches.join('\n')}` : header
        )
      }

      const content = intent.content ?? ''
      if (Buffer.byteLength(content, 'utf-8') > maxBytes) {
        return this.makeImmediateResult(
          intent,
          started,
          'error',
          'Write payload exceeds the file size limit.'
        )
      }
      await writeFile(fullPath, content, 'utf-8')
      return this.makeImmediateResult(intent, started, 'success', `Wrote ${fullPath}`)
    } catch (error) {
      return this.makeImmediateResult(
        intent,
        started,
        'error',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async searchFilesystem(
    rootPath: string,
    intent: FilesystemToolIntent
  ): Promise<string[]> {
    const patterns = normalizeSearchPatterns(intent.pattern)
    const maxResults = clampInt(intent.maxResults ?? 50, 50, 1, 200)
    const maxDepth = intent.recursive ? this.limits.maxDirectoryDepth : 1
    const matches: string[] = []

    const visit = async (dir: string): Promise<void> => {
      if (matches.length >= maxResults) return
      if (this.scope.depthFromRoot(dir) - this.scope.depthFromRoot(rootPath) > maxDepth) return

      let entries: import('fs').Dirent[]
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (matches.length >= maxResults) return
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'graphify-out')
          continue

        const full = join(dir, entry.name)
        const rel = relative(this.scope.root, full) || entry.name
        if (
          patterns.length === 0 ||
          patterns.some(
            (pattern) => wildcardMatch(entry.name, pattern) || wildcardMatch(rel, pattern)
          )
        ) {
          matches.push(rel)
        }

        if (entry.isDirectory() && intent.recursive) await visit(full)
      }
    }

    const info = await stat(rootPath)
    if (info.isDirectory()) {
      await visit(rootPath)
      return matches
    }

    const rel = relative(this.scope.root, rootPath) || rootPath
    return patterns.length === 0 || patterns.some((pattern) => wildcardMatch(rel, pattern))
      ? [rel]
      : []
  }

  /**
   * Read-only workspace discovery: walks the scoped workspace root and returns
   * its directory structure. Safe to run without human approval (no writes, no
   * process spawn, never escapes the scope). Any non-read-only operation still
   * escalates to a human.
   */
  private executeWorkspace(intent: GenericToolIntent): ToolResult {
    const started = Date.now()
    const payload = intent.payload
    const operation = String(payload['operation'] ?? 'discover').toLowerCase()
    const READ_ONLY = new Set(['discover', 'list', 'tree', 'scan', 'info', 'structure', 'stat'])
    if (!READ_ONLY.has(operation)) {
      return this.makeImmediateResult(
        intent,
        started,
        'requires_approval',
        `Workspace operation "${operation}" is not read-only discovery and needs human approval.`
      )
    }

    const depth = clampInt(Number(payload['depth']), 2, 1, this.limits.maxDirectoryDepth)
    const includeHidden = payload['includeHidden'] === true
    const root = this.scope.root
    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.venv', '__pycache__'])
    const MAX_ENTRIES = 500
    const lines: string[] = []
    let count = 0

    const walk = (dir: string, prefix: string, level: number): void => {
      if (level > depth || count >= MAX_ENTRIES) return
      let entries: import('fs').Dirent[]
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      entries = entries
        .filter((entry) => includeHidden || !entry.name.startsWith('.'))
        .sort(
          (a, b) =>
            Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)
        )

      for (const entry of entries) {
        if (count >= MAX_ENTRIES) {
          lines.push(`${prefix}… (truncated at ${MAX_ENTRIES} entries)`)
          return
        }
        count += 1
        const isDir = entry.isDirectory()
        lines.push(`${prefix}${entry.name}${isDir ? '/' : ''}`)
        if (isDir && !SKIP_DIRS.has(entry.name))
          walk(join(dir, entry.name), `${prefix}  `, level + 1)
      }
    }

    try {
      walk(root, '', 1)
      const observation = `Workspace root: ${root}\n${lines.join('\n')}`
      return {
        ...this.makeImmediateResult(intent, started, 'success', observation),
        metadata: { entries: count, root },
      }
    } catch (error) {
      return this.makeImmediateResult(
        intent,
        started,
        'error',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private executeAnalysis(intent: GenericToolIntent): ToolResult {
    const started = Date.now()
    const operation = String(intent.payload['operation'] ?? '')

    if (operation === 'tool_validation_error') {
      return {
        ...this.makeImmediateResult(intent, started, 'error', 'Tool arguments failed validation.'),
        metadata: { issues: intent.payload['issues'], tool: intent.payload['tool'] },
      }
    }

    if (operation === 'parse_security_log') {
      const text = String(intent.payload['text'] ?? '')
      const parsed = parseSecurityLog(text)
      return {
        ...this.makeImmediateResult(intent, started, 'success', summarizeSecurityLog(parsed)),
        metadata: { parsedSecurityLog: parsed, source: intent.payload['source'] },
      }
    }

    return this.makeImmediateResult(
      intent,
      started,
      'requires_approval',
      `Analysis operation "${operation || 'unknown'}" has no autonomous runner.`
    )
  }

  private clampShell(intent: ShellToolIntent): ShellToolIntent {
    return { ...intent, timeoutMs: resolveWatchdogTimeout(intent, this.limits) }
  }

  private evaluateSandboxPolicy(intent: ToolIntent): string | null {
    const networkTarget =
      intent.networkTarget ?? (intent.kind === 'network' ? intent.target : undefined)

    if (networkTarget && !this.sandboxPolicy.allowOutboundNetwork) {
      return `Outbound network access is disabled by sandbox policy for target ${networkTarget}.`
    }

    if (
      intent.bindInterface &&
      this.sandboxPolicy.bindInterfaces.length > 0 &&
      !this.sandboxPolicy.bindInterfaces.includes(intent.bindInterface)
    ) {
      return `Network interface "${intent.bindInterface}" is not allowed by sandbox policy.`
    }

    if (
      intent.maxConnections !== undefined &&
      intent.maxConnections > this.sandboxPolicy.maxConnectionsPerScan
    ) {
      return `Requested ${intent.maxConnections} connections exceeds sandbox max_connections_per_scan=${this.sandboxPolicy.maxConnectionsPerScan}.`
    }

    return null
  }

  private recordAudit(intent: ToolIntent, decision: ApprovalDecision, result: ToolResult): void {
    this.audit.record({
      runId: null,
      toolCallId: intent.id,
      intentKind: intent.kind,
      summary: summarizeIntent(intent),
      policyDecision: decision,
      status: result.status,
      durationMs: result.durationMs,
    })
  }

  private makeImmediateResult(
    intent: ToolIntent,
    started: number,
    status: ToolResult['status'],
    observation: string
  ): ToolResult {
    const ended = Date.now()
    return {
      id: intent.id,
      kind: intent.kind,
      status,
      observation,
      exitCode: null,
      startedAt: new Date(started).toISOString(),
      endedAt: new Date(ended).toISOString(),
      durationMs: ended - started,
    }
  }
}

/** Clamps a possibly-NaN number into [min, max], using `fallback` when invalid. */
function clampInt(value: number, fallback: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.floor(value) : fallback
  return Math.min(Math.max(n, min), max)
}

function baseCommand(command: string): string {
  return (command.split(/[\\/]/).pop() ?? command).toLowerCase().replace(/\.exe$/, '')
}

function isCommandUnavailable(result: ToolResult, command: string): boolean {
  const text = `${result.observation}\n${result.stderr ?? ''}`.toLowerCase()
  return result.status === 'error' && text.includes(`command not found: "${command.toLowerCase()}"`)
}

function summarizeTcpProbe(
  target: string,
  probes: Array<{ port: number; status: string; durationMs: number }>
): string {
  if (probes.length === 0) return `Aucun port TCP valide à tester sur ${target}.`
  return probes
    .map((row) => `${target}:${row.port}/tcp ${row.status} durationMs=${row.durationMs}`)
    .join('\n')
}

function isCmdVer(command: string, args: string[]): boolean {
  if (command === 'ver') return true
  return command === 'cmd' && args[0]?.toLowerCase() === '/c' && args[1]?.toLowerCase() === 'ver'
}

function normalizeSearchPatterns(pattern: FilesystemToolIntent['pattern']): string[] {
  if (!pattern) return []
  const values = Array.isArray(pattern) ? pattern : [pattern]
  return values.map((value) => value.trim()).filter(Boolean)
}

function wildcardMatch(value: string, pattern: string): boolean {
  const normalizedValue = value.replace(/\\/g, '/').toLowerCase()
  const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase()
  const regex = new RegExp(
    `^${escapeRegex(normalizedPattern).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`
  )
  return regex.test(normalizedValue)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
