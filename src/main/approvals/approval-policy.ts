import { readFileSync } from 'fs'
import { isIP } from 'net'
import { join, resolve } from 'path'
import type { ApprovalEvaluation, ApprovalPolicyConfig } from '@shared/types/approval.types'
import type { ToolIntent } from '@shared/types/sandbox.types'

const DEFAULT_POLICY: ApprovalPolicyConfig = {
  defaultDecision: 'allow',
  criticalPatterns: [
    '\\brm\\s+-rf\\b',
    '\\bdd\\s+if=',
    '\\bmkfs\\b',
    '\\bsudo\\b',
    '\\bssh\\s+root@',
    '\\bchmod\\s+777\\b',
    '\\bcurl\\b.*\\|\\s*(sh|bash|powershell)',
    '\\bwget\\b.*\\|\\s*(sh|bash|powershell)',
  ],
  deniedPatterns: ['\\bshutdown\\b', '\\breboot\\b', '\\bbcdedit\\b'],
  localTargets: ['localhost', '127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
  highRiskTools: ['shell', 'network', 'browser'],
}

function loadJsonConfig(): ApprovalPolicyConfig {
  const candidatePaths = [
    resolve(process.cwd(), 'config', 'sandbox', 'approval-rules.json'),
    join(__dirnameFallback(), 'config', 'sandbox', 'approval-rules.json'),
  ]

  for (const filePath of candidatePaths) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<ApprovalPolicyConfig>
      return { ...DEFAULT_POLICY, ...parsed }
    } catch {
      // Try the next location.
    }
  }

  return DEFAULT_POLICY
}

function __dirnameFallback(): string {
  return resolve(process.cwd())
}

function commandText(intent: ToolIntent): string {
  if (intent.kind === 'shell') return `${intent.command} ${(intent.args ?? []).join(' ')}`.trim()
  if (intent.kind === 'network') return `${intent.target} ${(intent.ports ?? []).join(',')} ${intent.scanType ?? ''}`.trim()
  if (intent.kind === 'browser') return `${intent.url} ${intent.script ?? ''}`.trim()
  if (intent.kind === 'filesystem') return `${intent.mode} ${intent.path}`.trim()
  return JSON.stringify(intent.payload)
}

function matchesAny(patterns: string[], text: string): string | null {
  for (const pattern of patterns) {
    if (new RegExp(pattern, 'i').test(text)) return pattern
  }
  return null
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return false
  const [a, b] = parts
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function isLocalTarget(value: string): boolean {
  const lower = value.toLowerCase()
  if (lower === 'localhost' || lower === '::1') return true
  if (lower.startsWith('127.')) return true
  if (isIP(lower) === 4) return isPrivateIpv4(lower)
  return false
}

export class ApprovalPolicy {
  constructor(private readonly config: ApprovalPolicyConfig = loadJsonConfig()) {}

  evaluate(intent: ToolIntent): ApprovalEvaluation {
    const text = commandText(intent)
    const deniedPattern = matchesAny(this.config.deniedPatterns, text)
    if (deniedPattern) {
      return {
        decision: 'deny',
        reason: `Denied by sandbox policy: ${deniedPattern}`,
        matchedRule: deniedPattern,
        intent,
      }
    }

    const criticalPattern = matchesAny(this.config.criticalPatterns, text)
    if (criticalPattern) {
      return {
        decision: 'needs_human_approval',
        reason: `Critical action requires human approval: ${criticalPattern}`,
        matchedRule: criticalPattern,
        intent,
      }
    }

    if (intent.kind === 'browser') {
      return {
        decision: 'needs_human_approval',
        reason: 'Browser automation can execute JavaScript and make untracked network requests.',
        intent,
      }
    }

    if (intent.kind === 'network' && !isLocalTarget(intent.target)) {
      return {
        decision: 'needs_human_approval',
        reason: `Network target is outside the local/private scope: ${intent.target}`,
        intent,
      }
    }

    return {
      decision: this.config.defaultDecision,
      reason: 'Allowed by approval policy.',
      intent,
    }
  }
}

export const approvalPolicy = new ApprovalPolicy()
