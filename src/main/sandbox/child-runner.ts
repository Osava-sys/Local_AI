import { type ChildProcess, spawn } from 'child_process'
import type { ShellToolIntent, SandboxLimits, ToolResult } from '@shared/types/sandbox.types'
import { normalizeCommand } from './command-normalizer'
import { buildMinimalEnv } from './environment'
import { FilesystemScope } from './filesystem-scope'
import { loadLimits } from './limits'
import { resolveWatchdogTimeout, watchdogTimeoutObservation } from './watchdog'

/**
 * Bounded, append-only accumulator for a process stream. Once the byte budget
 * is exhausted further data is dropped and `truncated` flips to true.
 */
class BoundedBuffer {
  private chunks: string[] = []
  private size = 0
  truncated = false

  constructor(private readonly max: number) {}

  add(text: string): void {
    if (this.truncated) return
    const remaining = this.max - this.size
    if (remaining <= 0) {
      this.truncated = true
      return
    }
    if (text.length > remaining) {
      this.chunks.push(text.slice(0, remaining))
      this.size = this.max
      this.truncated = true
    } else {
      this.chunks.push(text)
      this.size += text.length
    }
  }

  value(): string {
    const joined = this.chunks.join('')
    return this.truncated ? `${joined}\n…[output truncated]` : joined
  }
}

/**
 * The single point that spawns a real OS process. It executes an already
 * approved ShellToolIntent — it performs NO approval logic. Every guarantee
 * (timeout, output bounds, minimal env, shell:false, cwd scope) is enforced
 * here so tools and the executor never touch child_process directly.
 */
export class ChildProcessRunner {
  constructor(
    private readonly limits: SandboxLimits = loadLimits(),
    private readonly scope: FilesystemScope = new FilesystemScope(),
  ) {}

  async run(intent: ShellToolIntent): Promise<ToolResult> {
    const started = Date.now()
    const startedAt = new Date(started).toISOString()
    const timeoutMs = resolveWatchdogTimeout(intent, this.limits)
    const normalized = normalizeCommand(intent.command, intent.args)

    const requestedCwd = intent.cwd ?? this.scope.root
    const cwdCheck = this.scope.check(requestedCwd)
    if (!cwdCheck.ok) {
      return immediateError(intent, started, startedAt, `Working directory out of scope: ${cwdCheck.reason ?? requestedCwd}`)
    }

    return new Promise<ToolResult>(resolvePromise => {
      const stdout = new BoundedBuffer(this.limits.maxOutputBytes)
      const stderr = new BoundedBuffer(this.limits.maxOutputBytes)
      let settled = false
      let child: ChildProcess

      const finish = (status: ToolResult['status'], exitCode: number | null, observation?: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const ended = Date.now()
        const truncated = stdout.truncated || stderr.truncated
        resolvePromise({
          id: intent.id,
          kind: intent.kind,
          status,
          stdout: stdout.value(),
          stderr: stderr.value(),
          exitCode,
          observation: observation ?? summarize(status, stdout.value(), stderr.value(), exitCode),
          startedAt,
          endedAt: new Date(ended).toISOString(),
          durationMs: ended - started,
          truncated: truncated || undefined,
        })
      }

      try {
        child = spawn(normalized.command, normalized.args, {
          cwd: cwdCheck.resolvedPath,
          env: buildMinimalEnv(intent.environment),
          shell: false,
          windowsHide: true,
          detached: process.platform !== 'win32',
        })
      } catch (error) {
        finish('error', null, error instanceof Error ? error.message : String(error))
        return
      }

      const timer = setTimeout(() => {
        killTree(child)
        finish('timeout', null, watchdogTimeoutObservation(timeoutMs))
      }, timeoutMs)

      child.stdout?.on('data', chunk => stdout.add(String(chunk)))
      child.stderr?.on('data', chunk => stderr.add(String(chunk)))
      child.on('error', error => finish('error', null, describeSpawnError(error, normalized.command)))
      child.on('close', code => finish(code === 0 ? 'success' : 'error', code))
    })
  }
}

/** Best-effort termination of the process and any children it spawned. */
function killTree(child: ChildProcess): void {
  const pid = child.pid
  if (pid === undefined) {
    child.kill()
    return
  }
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    } catch {
      child.kill()
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

function immediateError(
  intent: ShellToolIntent,
  started: number,
  startedAt: string,
  observation: string,
): ToolResult {
  const ended = Date.now()
  return {
    id: intent.id,
    kind: intent.kind,
    status: 'error',
    stdout: '',
    stderr: observation,
    exitCode: null,
    observation,
    startedAt,
    endedAt: new Date(ended).toISOString(),
    durationMs: ended - started,
  }
}

/** Turns a raw spawn failure into an actionable, OS-aware observation. */
function describeSpawnError(error: Error, command: string): string {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    return `Command not found: "${command}" is not installed or not on PATH for this ${process.platform} host. Try an OS-appropriate equivalent.`
  }
  if ((error as NodeJS.ErrnoException).code === 'EACCES') {
    return `Permission denied executing "${command}".`
  }
  return error.message
}

function summarize(status: ToolResult['status'], stdout: string, stderr: string, exitCode: number | null): string {
  const out = stdout.trim()
  const err = stderr.trim()
  if (status === 'success') return out || `Command completed with exit code ${exitCode ?? 0}.`
  return err || out || `Command failed with exit code ${exitCode ?? 'unknown'}.`
}
