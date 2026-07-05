import { describe, it, expect } from 'vitest'
import type { ToolCall } from '@shared/types/agent.types'
import { ToolRegistry } from '../../src/main/agent/tools/registry'

describe('parser tool boundary', () => {
  it('does not expose parser.tool to the model-facing registry', () => {
    const registry = new ToolRegistry()
    expect(registry.has('parser')).toBe(false)
    expect(registry.has('parser.tool.ts')).toBe(false)
    expect(registry.list().some(tool => /parser/i.test(tool.name))).toBe(false)
  })

  it('returns an unknown-tool error if the model tries to call parser.tool with free text', async () => {
    const registry = new ToolRegistry()
    const call: ToolCall = {
      id: 'x',
      name: 'parser.tool.ts',
      args: { text: 'fabricated intermediate observation' },
      status: 'pending',
    }

    const execution = await registry.execute(call)

    expect(execution.result.status).toBe('error')
    expect(execution.result.observation).toMatch(/unknown tool/i)
  })
})
