import { describe, it, expect, beforeEach } from 'vitest'
import type { ToolCall } from '@shared/types/agent.types'
import { gobusterTool } from '../../src/main/agent/tools/gobuster.tool'
import { SandboxExecutor } from '../../src/main/sandbox/sandbox-executor'
import { markToolUnavailable, resetToolAvailabilityCache } from '../../src/main/sandbox/tool-availability'

const call: ToolCall = { id: 'g1', name: 'gobuster.tool.ts', args: {}, status: 'pending' }

describe('gobuster.tool URL normalization', () => {
  it('rewrites a 0.0.0.0 bind target to the loopback address', () => {
    const intent = gobusterTool.createIntent({ url: 'http://0.0.0.0:8080', wordlist: 'wordlists/common.txt' }, call)
    if (intent.kind !== 'shell') throw new Error('expected shell intent')

    expect(intent.args).toContain('http://127.0.0.1:8080/')
    expect(intent.args).not.toContain('http://0.0.0.0:8080')
    expect(intent.notes?.some(note => /normalized/i.test(note))).toBe(true)
    expect(intent.requiresBinary).toBe('gobuster')
    expect(intent.requiresPaths).toContain('wordlists/common.txt')
  })

  it('leaves a normal loopback URL unchanged', () => {
    const intent = gobusterTool.createIntent({ url: 'http://127.0.0.1:8080', wordlist: 'wordlists/common.txt' }, call)
    if (intent.kind !== 'shell') throw new Error('expected shell intent')
    expect(intent.args).toContain('http://127.0.0.1:8080')
    expect(intent.notes).toBeUndefined()
  })
})

describe('gobuster preflight before approval', () => {
  beforeEach(() => resetToolAvailabilityCache())

  it('fails fast (no approval) when the gobuster binary is missing', async () => {
    markToolUnavailable('gobuster')
    const intent = gobusterTool.createIntent({ url: 'http://127.0.0.1:8080', wordlist: 'wordlists/common.txt' }, call)

    const result = await new SandboxExecutor().execute(intent)

    expect(result.status).toBe('error')
    expect(result.observation).toContain('Gobuster is not installed')
    expect(result.needsApproval).toBeFalsy()
  })
})
