import { describe, it, expect, vi } from 'vitest'
import type { ApprovalPolicyConfig } from '@shared/types/approval.types'
import type { ToolCall } from '@shared/types/agent.types'
import { SandboxExecutor } from '../../src/main/sandbox/sandbox-executor'
import { ApprovalGate } from '../../src/main/sandbox/approval-gate'
import { ApprovalPolicy } from '../../src/main/approvals/approval-policy'
import type { ChildProcessRunner } from '../../src/main/sandbox/child-runner'
import { browserTool } from '../../src/main/agent/tools/browser.tool'

const config: ApprovalPolicyConfig = {
  defaultDecision: 'allow',
  criticalPatterns: [],
  deniedPatterns: [],
  localTargets: ['localhost'],
  highRiskTools: ['browser'],
}

function makeExecutor() {
  const run = vi.fn()
  const runner = { run } as unknown as ChildProcessRunner
  const executor = new SandboxExecutor(new ApprovalGate(new ApprovalPolicy(config)), runner)
  return { executor, run }
}

const call: ToolCall = { id: 'call-b', name: 'browser', args: {}, status: 'pending' }

describe('browser tool sandbox routing', () => {
  it('builds a critical-risk browser intent from tool args', () => {
    const intent = browserTool.createIntent({ url: 'http://example.test', action: 'evaluate', script: 'alert(1)' }, call)
    expect(intent.kind).toBe('browser')
    expect(intent.risk).toBe('critical')
  })

  it('routes browser intents to human approval, never to direct execution', async () => {
    const { executor, run } = makeExecutor()
    const intent = browserTool.createIntent({ url: 'http://localhost', action: 'open' }, call)

    const result = await executor.execute(intent)

    expect(result.status).toBe('requires_approval')
    expect(result.needsApproval).toBe(true)
    expect(run).not.toHaveBeenCalled()
  })

  it('escalates even when the policy patterns are empty (kind-based rule)', async () => {
    // No critical/denied patterns match a plain URL, yet browser automation must still escalate.
    const { executor } = makeExecutor()
    const intent = browserTool.createIntent({ url: 'http://localhost', action: 'screenshot' }, call)
    const result = await executor.execute(intent)
    expect(result.status).toBe('requires_approval')
  })
})
