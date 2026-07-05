import { describe, it, expect } from 'vitest'
import type { ShellToolIntent } from '@shared/types/sandbox.types'
import { ChildProcessRunner } from '../../src/main/sandbox/child-runner'
import { DEFAULT_LIMITS } from '../../src/main/sandbox/limits'

// Use the current Node binary by absolute path so the test never depends on
// PATH resolution or a shell builtin (echo is not a real exe with shell:false).
const NODE = process.execPath

function shell(args: string[], overrides: Partial<ShellToolIntent> = {}): ShellToolIntent {
  return { id: 't', kind: 'shell', command: NODE, args, ...overrides }
}

describe('ChildProcessRunner — real process execution', () => {
  it('captures stdout and reports success for a normal command', async () => {
    const runner = new ChildProcessRunner()
    const result = await runner.run(shell(['-e', 'process.stdout.write("test-ok")']))

    expect(result.status).toBe('success')
    expect(result.stdout).toContain('test-ok')
    expect(result.exitCode).toBe(0)
  })

  it('reports an actionable error for a command that cannot be spawned', async () => {
    const runner = new ChildProcessRunner()
    const result = await runner.run({ id: 't', kind: 'shell', command: 'definitely_not_a_real_binary_xyz' })
    expect(result.status).toBe('error')
    expect(result.observation).toMatch(/not installed or not on PATH/i)
  })

  it('reports error exit for a command that fails', async () => {
    const runner = new ChildProcessRunner()
    const result = await runner.run(shell(['-e', 'process.stderr.write("boom"); process.exit(3)']))
    expect(result.status).toBe('error')
    expect(result.exitCode).toBe(3)
    expect(result.stderr).toContain('boom')
  })

  it('kills and reports timeout for a long-running command', async () => {
    const runner = new ChildProcessRunner()
    const result = await runner.run(shell(['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 250 }))
    expect(result.status).toBe('timeout')
  })

  it('truncates output beyond the byte limit', async () => {
    const runner = new ChildProcessRunner({ ...DEFAULT_LIMITS, maxOutputBytes: 8 })
    const result = await runner.run(shell(['-e', 'process.stdout.write("X".repeat(1000))']))

    expect(result.status).toBe('success')
    expect(result.truncated).toBe(true)
    expect(result.stdout?.startsWith('XXXXXXXX')).toBe(true)
    expect(result.stdout?.length ?? 0).toBeLessThan(1000)
  })

  it('runs with shell:false so metacharacters are passed literally, not interpreted', async () => {
    const runner = new ChildProcessRunner()
    // With a shell these would be two commands; with shell:false they are inert argv.
    const result = await runner.run(shell(['-e', 'process.stdout.write("A")', '&&', 'echo', 'B']))

    expect(result.status).toBe('success')
    expect(result.stdout).toContain('A')
    expect(result.stdout).not.toContain('B')
  })
})
