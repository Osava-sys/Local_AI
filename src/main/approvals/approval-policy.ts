import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import type { ApprovalEvaluation, ApprovalPolicyConfig } from '@shared/types/approval.types'
import type { ToolIntent } from '@shared/types/sandbox.types'
import { isLocalTarget } from '../sandbox/network-scope'

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
    '\\bpowershell(?:\\.exe)?\\b.*-command\\b',
    '\\bpwsh(?:\\.exe)?\\b.*-command\\b',
    '\\bpowershell(?:\\.exe)?\\b.*\\b(invoke-expression|iex)\\b',
    '\\bpwsh(?:\\.exe)?\\b.*\\b(invoke-expression|iex)\\b',
    '\\bsqlmap\\b',
    '\\bgobuster\\b',
    '\\bburpsuite(?:-cli)?\\b',
  ],
  deniedPatterns: [
    '\\bshutdown\\b',
    '\\breboot\\b',
    '\\bbcdedit\\b',
    '\\b(?:powershell|pwsh)(?:\\.exe)?\\b.*-(?:encodedcommand|enc|e)\\b',
  ],
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

    if (intent.kind === 'shell' && isPowershellEncodedCommand(text)) {
      return {
        decision: 'deny',
        reason: 'PowerShell EncodedCommand is denied because it hides executable logic from review.',
        matchedRule: 'powershell-encoded-command',
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

    if (intent.kind === 'shell' && isDangerousPowershellCommand(text)) {
      return {
        decision: 'needs_human_approval',
        reason: 'PowerShell command contains high-risk download/eval behavior.',
        matchedRule: 'powershell-dangerous-command',
        intent,
      }
    }

    if (intent.kind === 'shell' && containsShellControlOperator(text)) {
      return {
        decision: 'needs_human_approval',
        reason: 'Shell command contains control operators, pipes, or redirection and needs review.',
        matchedRule: 'shell-control-operator',
        intent,
      }
    }

    if (intent.kind === 'shell' && isPowershellCommandMode(text)) {
      return {
        decision: 'needs_human_approval',
        reason: 'PowerShell -Command can execute complex logic and needs review.',
        matchedRule: 'powershell-command',
        intent,
      }
    }

    if (intent.risk === 'critical') {
      return {
        decision: 'needs_human_approval',
        reason: 'Critical-risk tool intent requires human approval.',
        matchedRule: 'critical-risk-intent',
        intent,
      }
    }

    if (intent.networkTarget && !isLocalTarget(intent.networkTarget)) {
      return {
        decision: 'needs_human_approval',
        reason: `Network target is outside the local/private scope: ${intent.networkTarget}`,
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

function isPowershellEncodedCommand(text: string): boolean {
  return /\b(?:powershell|pwsh)(?:\.exe)?\b[\s\S]*-(?:encodedcommand|enc|e)\b/i.test(text)
}

function isPowershellCommandMode(text: string): boolean {
  return /\b(?:powershell|pwsh)(?:\.exe)?\b[\s\S]*-command\b/i.test(text)
}

function isDangerousPowershellCommand(text: string): boolean {
  return /\b(?:powershell|pwsh)(?:\.exe)?\b[\s\S]*(?:\biex\b|\binvoke-expression\b|downloadstring|invoke-webrequest|iwr)[\s\S]*\|[\s\S]*(?:\biex\b|\binvoke-expression\b)/i.test(text)
}

function containsShellControlOperator(text: string): boolean {
  return /(?:&&|\|\||[|;<>])/.test(text)
}
