import { describe, it, expect } from 'vitest'
import type { ApprovalPolicyConfig } from '@shared/types/approval.types'
import type { ShellToolIntent } from '@shared/types/sandbox.types'
import { ApprovalPolicy } from '../../src/main/approvals/approval-policy'

function shell(command: string, args: string[] = []): ShellToolIntent {
  return { id: 't', kind: 'shell', command, args }
}

describe('ApprovalPolicy — configuration is the source of truth', () => {
  it('loads rules from config/sandbox/approval-rules.json by default', () => {
    // No explicit config -> the policy reads the JSON file relative to cwd.
    const policy = new ApprovalPolicy()
    expect(policy.evaluate(shell('shutdown', ['/s'])).decision).toBe('deny')
    expect(policy.evaluate(shell('reg', ['delete', 'HKLM\\Foo'])).decision).toBe('deny')
    expect(policy.evaluate(shell('rm', ['-rf', '/tmp/x'])).decision).toBe('needs_human_approval')
    expect(policy.evaluate(shell('format', ['C:'])).decision).toBe('needs_human_approval')
  })

  it('honours a novel denied pattern supplied via config (not hardcoded)', () => {
    const config: ApprovalPolicyConfig = {
      defaultDecision: 'allow',
      criticalPatterns: [],
      deniedPatterns: ['\\bquux-danger\\b'],
      localTargets: ['localhost'],
      highRiskTools: ['shell'],
    }
    const policy = new ApprovalPolicy(config)
    const denied = policy.evaluate(shell('quux-danger', ['now']))
    expect(denied.decision).toBe('deny')
    expect(denied.matchedRule).toBe('\\bquux-danger\\b')
  })

  it('allows otherwise-dangerous commands when the config carries no patterns', () => {
    // Proves the built-in danger list does not leak past an explicit empty config.
    const config: ApprovalPolicyConfig = {
      defaultDecision: 'allow',
      criticalPatterns: [],
      deniedPatterns: [],
      localTargets: [],
      highRiskTools: [],
    }
    const policy = new ApprovalPolicy(config)
    expect(policy.evaluate(shell('rm', ['-rf', '/'])).decision).toBe('allow')
  })
})
