import { describe, it, expect, vi } from 'vitest'
import type { ApprovalPolicyConfig } from '@shared/types/approval.types'
import type { ShellToolIntent, ToolResult } from '@shared/types/sandbox.types'
import { ApprovalPolicy } from '../../src/main/approvals/approval-policy'
import { ApprovalGate } from '../../src/main/sandbox/approval-gate'
import type { ChildProcessRunner } from '../../src/main/sandbox/child-runner'
import { SandboxExecutor } from '../../src/main/sandbox/sandbox-executor'
import type { TcpPortProber } from '../../src/main/sandbox/tcp-port-prober'

const allowAll: ApprovalPolicyConfig = {
  defaultDecision: 'allow',
  criticalPatterns: [],
  deniedPatterns: [],
  localTargets: [],
  highRiskTools: [],
}

function toolResult(intent: ShellToolIntent, observation: string): ToolResult {
  return {
    id: intent.id,
    kind: 'shell',
    status: 'error',
    observation,
    stderr: observation,
    exitCode: null,
    startedAt: 'a',
    endedAt: 'b',
    durationMs: 1,
  }
}

describe('SandboxExecutor network fallback', () => {
  it('falls back to the internal TCP prober when nmap is unavailable', async () => {
    const run = vi.fn(async (intent: ShellToolIntent) =>
      toolResult(intent, 'Command not found: "nmap" is not installed or not on PATH for this win32 host.'),
    )
    const probe = vi.fn(async () => [{ port: 27017, status: 'open' as const, durationMs: 3 }])
    const executor = new SandboxExecutor(
      new ApprovalGate(new ApprovalPolicy(allowAll)),
      { run } as unknown as ChildProcessRunner,
      undefined,
      undefined,
      undefined,
      { probe } as Pick<TcpPortProber, 'probe'>,
    )

    const result = await executor.execute({
      id: 'n',
      kind: 'network',
      target: '127.0.0.1',
      ports: [27017],
      scanType: 'version',
      timeoutMs: 1234,
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0].command).toBe('nmap')
    expect(probe).toHaveBeenCalledWith({ target: '127.0.0.1', ports: [27017], timeoutMs: 1234 })
    expect(result.kind).toBe('network')
    expect(result.status).toBe('success')
    expect(result.observation).toContain('127.0.0.1:27017/tcp open')
    expect(result.metadata).toMatchObject({ fallbackReason: 'nmap_unavailable' })
  })

  it('uses the internal TCP prober directly for connect scans', async () => {
    const run = vi.fn()
    const probe = vi.fn(async () => [{ port: 5432, status: 'closed' as const, durationMs: 2 }])
    const executor = new SandboxExecutor(
      new ApprovalGate(new ApprovalPolicy(allowAll)),
      { run } as unknown as ChildProcessRunner,
      undefined,
      undefined,
      undefined,
      { probe } as Pick<TcpPortProber, 'probe'>,
    )

    const result = await executor.execute({
      id: 'n',
      kind: 'network',
      target: '127.0.0.1',
      ports: [5432],
      scanType: 'connect',
      timeoutMs: 200,
    })

    expect(run).not.toHaveBeenCalled()
    expect(probe).toHaveBeenCalledWith({ target: '127.0.0.1', ports: [5432], timeoutMs: 200 })
    expect(result.observation).toContain('127.0.0.1:5432/tcp closed')
  })
})
