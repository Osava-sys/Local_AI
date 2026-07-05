import { describe, it, expect, vi } from 'vitest'
import type { ApprovalDecision, ApprovalEvaluation } from '@shared/types/approval.types'
import type {
  NetworkToolIntent,
  SandboxPolicy,
  ShellToolIntent,
  ToolIntent,
  ToolResult,
} from '@shared/types/sandbox.types'
import { SandboxExecutor } from '../../src/main/sandbox/sandbox-executor'
import type { ApprovalGate } from '../../src/main/sandbox/approval-gate'
import type { ChildProcessRunner } from '../../src/main/sandbox/child-runner'

const shellIntent: ShellToolIntent = { id: 's', kind: 'shell', command: 'ls', args: ['-la'] }
const networkIntent: NetworkToolIntent = {
  id: 'n',
  kind: 'network',
  target: '127.0.0.1',
  ports: [80, 443],
  scanType: 'version',
}

/** Builds a SandboxExecutor whose gate returns a fixed decision and whose runner is a spy. */
function makeExecutor(decision: ApprovalDecision) {
  const gate = {
    evaluate: (intent: ToolIntent): ApprovalEvaluation => ({ decision, reason: `test:${decision}`, intent }),
  } as unknown as ApprovalGate

  const run = vi.fn(
    async (intent: ShellToolIntent): Promise<ToolResult> => ({
      id: intent.id,
      kind: intent.kind,
      status: 'success',
      observation: 'ran',
      exitCode: 0,
      startedAt: 'a',
      endedAt: 'b',
      durationMs: 1,
    }),
  )
  const runner = { run } as unknown as ChildProcessRunner

  return { executor: new SandboxExecutor(gate, runner), run }
}

function makeExecutorWithSandboxPolicy(policy: SandboxPolicy) {
  const gate = {
    evaluate: (intent: ToolIntent): ApprovalEvaluation => ({ decision: 'allow', reason: 'test:allow', intent }),
  } as unknown as ApprovalGate
  const run = vi.fn(
    async (intent: ShellToolIntent): Promise<ToolResult> => ({
      id: intent.id,
      kind: intent.kind,
      status: 'success',
      observation: 'ran',
      exitCode: 0,
      startedAt: 'a',
      endedAt: 'b',
      durationMs: 1,
    }),
  )
  const runner = { run } as unknown as ChildProcessRunner
  return { executor: new SandboxExecutor(gate, runner, undefined, undefined, undefined, undefined, policy), run }
}

const sandboxPolicy: SandboxPolicy = {
  runner: 'child_process',
  workspaceRoot: '.',
  allowDocker: false,
  allowChildProcess: true,
  allowBrowserAutomation: false,
  allowOutboundNetwork: true,
  bindInterfaces: [],
  maxConnectionsPerScan: 64,
  maxOutputBytes: 1024,
  maxFileSizeMB: 10,
  maxDirectoryDepth: 5,
  defaultTimeoutMs: 30000,
}

describe('SandboxExecutor — policy enforcement and routing', () => {
  it('short-circuits denied intents without touching the runner', async () => {
    const { executor, run } = makeExecutor('deny')
    const result = await executor.execute(shellIntent)
    expect(result.status).toBe('denied')
    expect(run).not.toHaveBeenCalled()
  })

  it('returns a requires_approval result and does not execute when approval is needed', async () => {
    const { executor, run } = makeExecutor('needs_human_approval')
    const result = await executor.execute(shellIntent)
    expect(result.status).toBe('requires_approval')
    expect(result.needsApproval).toBe(true)
    expect(run).not.toHaveBeenCalled()
  })

  it('routes an allowed shell intent to the child runner', async () => {
    const { executor, run } = makeExecutor('allow')
    const result = await executor.execute(shellIntent)
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.observation).toBe('ran')
  })

  it('translates an allowed network intent into an nmap command for the runner', async () => {
    const { executor, run } = makeExecutor('allow')
    await executor.execute(networkIntent)
    expect(run).toHaveBeenCalledTimes(1)
    const passed = run.mock.calls[0][0]
    expect(passed.command).toBe('nmap')
    expect(passed.args).toContain('127.0.0.1')
    expect(passed.args).toContain('-sV')
  })

  it('denies network execution when outbound network is disabled', async () => {
    const { executor, run } = makeExecutorWithSandboxPolicy({ ...sandboxPolicy, allowOutboundNetwork: false })
    const result = await executor.execute(networkIntent)

    expect(result.status).toBe('denied')
    expect(result.observation).toContain('Outbound network access is disabled')
    expect(run).not.toHaveBeenCalled()
  })

  it('denies intents that exceed max connections per scan', async () => {
    const { executor, run } = makeExecutorWithSandboxPolicy({ ...sandboxPolicy, maxConnectionsPerScan: 2 })
    const result = await executor.execute({ ...shellIntent, networkTarget: '127.0.0.1', maxConnections: 3 })

    expect(result.status).toBe('denied')
    expect(result.observation).toContain('max_connections_per_scan')
    expect(run).not.toHaveBeenCalled()
  })

  it('denies disallowed bound network interfaces', async () => {
    const { executor, run } = makeExecutorWithSandboxPolicy({ ...sandboxPolicy, bindInterfaces: ['eth0'] })
    const result = await executor.execute({ ...shellIntent, networkTarget: '127.0.0.1', bindInterface: 'wlan0' })

    expect(result.status).toBe('denied')
    expect(result.observation).toContain('not allowed')
    expect(run).not.toHaveBeenCalled()
  })
})
