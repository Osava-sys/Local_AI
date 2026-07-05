import { spawn } from 'child_process'
import type { ShellToolIntent, ToolResult } from '@shared/types/sandbox.types'
import { normalizeCommand } from './command-normalizer'

export class ChildProcessRunner {
  async run(intent: ShellToolIntent): Promise<ToolResult> {
    const started = Date.now()
    const startedAt = new Date(started).toISOString()
    const timeoutMs = intent.timeoutMs ?? 30000
    const normalized = normalizeCommand(intent.command, intent.args)

    return new Promise(resolve => {
      let stdout = ''
      let stderr = ''
      let settled = false

      const child = spawn(normalized.command, normalized.args, {
        cwd: intent.cwd ?? process.cwd(),
        env: { ...process.env, ...(intent.environment ?? {}) },
        shell: false,
        windowsHide: true,
      })

      const finish = (status: ToolResult['status'], exitCode: number | null, observation?: string): void => {
        if (settled) return
        settled = true
        const ended = Date.now()
        resolve({
          id: intent.id,
          kind: intent.kind,
          status,
          stdout,
          stderr,
          exitCode,
          observation: observation ?? summarize(status, stdout, stderr, exitCode),
          startedAt,
          endedAt: new Date(ended).toISOString(),
          durationMs: ended - started,
        })
      }

      const timer = setTimeout(() => {
        child.kill()
        finish('timeout', null, `Command timed out after ${timeoutMs}ms.`)
      }, timeoutMs)

      child.stdout.on('data', chunk => {
        stdout += String(chunk)
      })

      child.stderr.on('data', chunk => {
        stderr += String(chunk)
      })

      child.on('error', error => {
        clearTimeout(timer)
        finish('error', null, error.message)
      })

      child.on('close', code => {
        clearTimeout(timer)
        finish(code === 0 ? 'success' : 'error', code)
      })
    })
  }
}

function summarize(status: ToolResult['status'], stdout: string, stderr: string, exitCode: number | null): string {
  const out = stdout.trim()
  const err = stderr.trim()
  if (status === 'success') return out || `Command completed with exit code ${exitCode ?? 0}.`
  return err || out || `Command failed with exit code ${exitCode ?? 'unknown'}.`
}
