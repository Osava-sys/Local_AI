import { readFile, readdir, writeFile } from 'fs/promises'
import { resolve } from 'path'
import type { FilesystemToolIntent, NetworkToolIntent, ShellToolIntent, ToolIntent, ToolResult } from '@shared/types/sandbox.types'
import { ApprovalGate } from './approval-gate'
import { ChildProcessRunner } from './child-runner'

export class SandboxExecutor {
  constructor(
    private readonly approvalGate = new ApprovalGate(),
    private readonly childRunner = new ChildProcessRunner(),
  ) {}

  async execute(intent: ToolIntent): Promise<ToolResult> {
    const started = Date.now()
    const evaluation = this.approvalGate.evaluate(intent)

    if (evaluation.decision === 'deny') {
      return this.makeImmediateResult(intent, started, 'denied', evaluation.reason)
    }

    if (evaluation.decision === 'needs_human_approval') {
      return {
        ...this.makeImmediateResult(intent, started, 'requires_approval', evaluation.reason),
        needsApproval: true,
        approvalReason: evaluation.reason,
      }
    }

    if (intent.kind === 'shell') return this.childRunner.run(intent)
    if (intent.kind === 'network') return this.executeNetwork(intent)
    if (intent.kind === 'filesystem') return this.executeFilesystem(intent)

    return this.makeImmediateResult(
      intent,
      started,
      'requires_approval',
      `${intent.kind} intent is registered but has no low-risk runner yet.`,
    )
  }

  private executeNetwork(intent: NetworkToolIntent): Promise<ToolResult> {
    const ports = intent.ports?.length ? ['-p', intent.ports.join(',')] : []
    const scanFlags = intent.scanType === 'version' ? ['-sV'] : intent.scanType === 'syn' ? ['-sS'] : []
    const shellIntent: ShellToolIntent = {
      id: intent.id,
      kind: 'shell',
      command: 'nmap',
      args: [...scanFlags, ...ports, intent.target],
      timeoutMs: intent.timeoutMs,
      reason: intent.reason,
      risk: intent.risk,
    }
    return this.childRunner.run(shellIntent)
  }

  private async executeFilesystem(intent: FilesystemToolIntent): Promise<ToolResult> {
    const started = Date.now()
    const fullPath = resolve(process.cwd(), intent.path)

    try {
      if (intent.mode === 'read') {
        const content = await readFile(fullPath, 'utf-8')
        return this.makeImmediateResult(intent, started, 'success', content)
      }

      if (intent.mode === 'list') {
        const entries = await readdir(fullPath)
        return this.makeImmediateResult(intent, started, 'success', entries.join('\n'))
      }

      await writeFile(fullPath, intent.content ?? '', 'utf-8')
      return this.makeImmediateResult(intent, started, 'success', `Wrote ${fullPath}`)
    } catch (error) {
      return this.makeImmediateResult(intent, started, 'error', error instanceof Error ? error.message : String(error))
    }
  }

  private makeImmediateResult(
    intent: ToolIntent,
    started: number,
    status: ToolResult['status'],
    observation: string,
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
