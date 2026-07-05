import { describe, expect, it, vi } from 'vitest'
import type { ApprovalDecision, ApprovalEvaluation } from '@shared/types/approval.types'
import type { ShellToolIntent, ToolIntent, ToolResult } from '@shared/types/sandbox.types'
import type { ApprovalGate } from '../../src/main/sandbox/approval-gate'
import type { ChildProcessRunner } from '../../src/main/sandbox/child-runner'
import { parseWindowsVersionOutput, summarizeWindowsVersion } from '../../src/main/sandbox/parsers/windows-version.parser'
import { SandboxExecutor } from '../../src/main/sandbox/sandbox-executor'

describe('Windows version parser', () => {
  it('treats cmd /c ver as kernel/build only, not product edition', () => {
    const parsed = parseWindowsVersionOutput('Microsoft Windows [version 10.0.26200.8737]')

    expect(parsed.kernelVersion).toBe('10.0.26200.8737')
    expect(parsed.build).toBe(26200)
    expect(parsed.productName).toBeNull()
    expect(parsed.edition).toBeNull()
    expect(summarizeWindowsVersion(parsed)).toContain('Do not infer Windows 10/11 or Pro/Home')
  })

  it('compacts cmd /c ver sandbox observations with anti-hallucination notes', async () => {
    const gate = {
      evaluate: (intent: ToolIntent): ApprovalEvaluation => ({ decision: 'allow' as ApprovalDecision, reason: 'ok', intent }),
    } as unknown as ApprovalGate
    const run = vi.fn(
      async (intent: ShellToolIntent): Promise<ToolResult> => ({
        id: intent.id,
        kind: 'shell',
        status: 'success',
        stdout: 'Microsoft Windows [version 10.0.26200.8737]',
        observation: 'Microsoft Windows [version 10.0.26200.8737]',
        exitCode: 0,
        startedAt: 'a',
        endedAt: 'b',
        durationMs: 1,
      }),
    )
    const executor = new SandboxExecutor(gate, { run } as unknown as ChildProcessRunner)

    const result = await executor.execute({ id: 's', kind: 'shell', command: 'cmd /c ver', args: [] })

    expect(result.observation).toContain('Windows NT kernel version: 10.0.26200.8737')
    expect(result.observation).toContain('Product name: unknown')
    expect(result.observation).toContain('Edition: unknown')
    expect(result.observation).not.toContain('Windows 10 Pro')
  })
})
