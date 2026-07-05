import { describe, it, expect } from 'vitest'
import type { ChatChunk, ModelInfo, ModelProvider } from '@shared/types/model.types'
import type { ReasoningStep } from '@shared/types/agent.types'
import type { ToolResult } from '@shared/types/sandbox.types'
import { runReactLoop } from '../../src/main/agent/react-loop'
import { MemoryManager } from '../../src/main/agent/memory-manager'
import type { ToolRegistry } from '../../src/main/agent/tools/registry'

function metadata(): ModelInfo {
  return {
    name: 'fake',
    version: '0',
    sizeGB: 0,
    quantization: 'Q8_0',
    contextLength: 4096,
    gpuLayers: 0,
    providerType: 'llamacpp-http',
    host: 'local',
  }
}

function providerYielding(response: string): ModelProvider {
  return {
    name: 'fake',
    type: 'llamacpp-http',
    async init() {},
    async *chatStream(): AsyncIterable<ChatChunk> {
      yield { token: response, delta: response, cumulativeTokens: response.length, timestamp: new Date() }
    },
    async embed() {
      return []
    },
    getMetadata: metadata,
  }
}

/** Tool registry whose only tool returns a `denied` result (approval expired). */
function blockedTools(approvalOutcome: 'expired' | 'rejected'): ToolRegistry {
  return {
    list: () => [{ name: 'gobuster.tool.ts', description: 'web enum' }],
    execute: async (call: { id: string; name: string }) => {
      const result: ToolResult = {
        id: call.id,
        kind: 'shell',
        status: 'denied',
        observation: `Approval ${approvalOutcome}; gobuster action was not executed.`,
        startedAt: 'a',
        endedAt: 'b',
        durationMs: 1,
        metadata: { approvalOutcome },
      }
      return { call: { ...call, status: 'error' }, intent: { id: call.id, kind: 'shell' }, result }
    },
  } as unknown as ToolRegistry
}

async function collect(iter: AsyncIterable<ReasoningStep>): Promise<ReasoningStep[]> {
  const steps: ReasoningStep[] = []
  for await (const step of iter) steps.push(step)
  return steps
}

const TOOL_CALL = 'REASONING: je lance une énumération.\n```json\n{"tool":"gobuster.tool.ts","args":{"url":"http://127.0.0.1:8080","wordlist":"w"}}\n```'

describe('runReactLoop — terminal state on blocked approval', () => {
  it('emits a FINAL blocked step when a tool result is denied by an expired approval', async () => {
    const steps = await collect(
      runReactLoop('scan', blockedTools('expired'), new MemoryManager(), {
        provider: providerYielding(TOOL_CALL),
        maxSteps: 3,
      }),
    )

    const terminal = steps[steps.length - 1]
    expect(terminal.stopReason).toBe('blocked')
    expect(terminal.content).toMatch(/FINAL/)
    expect(terminal.content.toLowerCase()).toMatch(/expir/)
    // The blocked marker must be present so the orchestrator will not mark the run done.
    expect(steps.some(step => step.stopReason === 'blocked')).toBe(true)
  })

  it('reports a rejected approval as blocked too', async () => {
    const steps = await collect(
      runReactLoop('scan', blockedTools('rejected'), new MemoryManager(), {
        provider: providerYielding(TOOL_CALL),
        maxSteps: 3,
      }),
    )
    const terminal = steps[steps.length - 1]
    expect(terminal.stopReason).toBe('blocked')
    expect(terminal.content.toLowerCase()).toMatch(/refus/)
  })
})
