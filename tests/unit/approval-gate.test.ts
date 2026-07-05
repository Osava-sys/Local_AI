import { describe, it, expect } from 'vitest'
import type { ApprovalPolicyConfig } from '@shared/types/approval.types'
import type { ToolIntent } from '@shared/types/sandbox.types'
import { ApprovalGate } from '../../src/main/sandbox/approval-gate'
import { ApprovalPolicy } from '../../src/main/approvals/approval-policy'

// An explicit config keeps the test independent of config/sandbox/approval-rules.json.
const config: ApprovalPolicyConfig = {
  defaultDecision: 'allow',
  criticalPatterns: ['\\brm\\s+-rf\\b', '\\bsudo\\b'],
  deniedPatterns: ['\\bshutdown\\b', '\\breboot\\b'],
  localTargets: ['localhost', '127.0.0.1'],
  highRiskTools: ['shell', 'network', 'browser'],
}

const gate = new ApprovalGate(new ApprovalPolicy(config))

function shell(command: string, args: string[] = []): ToolIntent {
  return { id: 't', kind: 'shell', command, args }
}

describe('ApprovalGate', () => {
  it('denies commands matching a denied pattern', () => {
    const result = gate.evaluate(shell('shutdown', ['/s']))
    expect(result.decision).toBe('deny')
    expect(result.matchedRule).toBeDefined()
  })

  it('requires human approval for critical commands', () => {
    const result = gate.evaluate(shell('rm', ['-rf', '/tmp/test']))
    expect(result.decision).toBe('needs_human_approval')
  })

  it('requires human approval for any browser automation', () => {
    const result = gate.evaluate({ id: 't', kind: 'browser', url: 'http://localhost', action: 'open' })
    expect(result.decision).toBe('needs_human_approval')
  })

  it('requires human approval for network targets outside the local scope', () => {
    const result = gate.evaluate({ id: 't', kind: 'network', target: '8.8.8.8', ports: [80] })
    expect(result.decision).toBe('needs_human_approval')
  })

  it('allows scans against local/private targets', () => {
    const result = gate.evaluate({ id: 't', kind: 'network', target: '127.0.0.1', ports: [80] })
    expect(result.decision).toBe('allow')
  })

  it('allows benign shell commands by default', () => {
    const result = gate.evaluate(shell('ls', ['-la']))
    expect(result.decision).toBe('allow')
  })
})
