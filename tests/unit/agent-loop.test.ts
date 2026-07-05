import { describe, it, expect } from 'vitest'
import type { ChatChunk, ModelInfo, ModelProvider } from '@shared/types/model.types'
import type { ReasoningStep } from '@shared/types/agent.types'
import { runReactLoop } from '../../src/main/agent/react-loop'
import { MemoryManager } from '../../src/main/agent/memory-manager'
import type { ToolRegistry } from '../../src/main/agent/tools/registry'

function fakeMetadata(): ModelInfo {
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

interface FakeProviderOptions {
  /** One reply per chatStream() call; the last entry is reused for extra calls. */
  responses?: string[]
  /** When set, every chatStream() call throws this error. */
  throwError?: Error
}

function makeProvider(opts: FakeProviderOptions): { provider: ModelProvider; callCount: () => number } {
  let calls = 0
  const provider: ModelProvider = {
    name: 'fake',
    type: 'llamacpp-http',
    async init() {},
    async *chatStream(): AsyncIterable<ChatChunk> {
      const index = calls
      calls += 1
      if (opts.throwError) throw opts.throwError
      const list = opts.responses ?? ['']
      const text = list[Math.min(index, list.length - 1)]
      yield { token: text, delta: text, cumulativeTokens: text.length, timestamp: new Date() }
    },
    async embed() {
      return []
    },
    getMetadata() {
      return fakeMetadata()
    },
  }
  return { provider, callCount: () => calls }
}

/** Tools that must never be invoked (used by tests that stop before acting). */
const inertTools = {
  list: () => [{ name: 'shell', description: 'runs a shell command' }],
  execute: async () => {
    throw new Error('execute should not be called in this test')
  },
} as unknown as ToolRegistry

async function collect(iter: AsyncIterable<ReasoningStep>): Promise<ReasoningStep[]> {
  const steps: ReasoningStep[] = []
  for await (const step of iter) steps.push(step)
  return steps
}

describe('runReactLoop', () => {
  it('yields a single diagnostic reason step when no provider is connected', async () => {
    const steps = await collect(runReactLoop('bonjour', inertTools, new MemoryManager(), {}))
    expect(steps).toHaveLength(1)
    expect(steps[0].type).toBe('reason')
    expect(steps[0].content).toMatch(/provider/i)
  })

  it('stops after the reason step when the model emits a stop condition', async () => {
    const { provider } = makeProvider({ responses: ['Analyse terminee. FINAL'] })
    const steps = await collect(runReactLoop('scan', inertTools, new MemoryManager(), { provider, maxSteps: 5 }))
    expect(steps).toHaveLength(1)
    expect(steps[0].type).toBe('reason')
  })

  it('stops with an observation when the model requests no tool', async () => {
    const { provider } = makeProvider({ responses: ['Je reflechis, pas d action pour le moment.'] })
    const steps = await collect(runReactLoop('scan', inertTools, new MemoryManager(), { provider, maxSteps: 5 }))
    expect(steps.map(s => s.type)).toEqual(['reason', 'observe'])
    expect(steps[1].content).toMatch(/aucun appel outil/i)
  })

  it('retries the provider, surfaces an error observation, then rethrows', async () => {
    const boom = new Error('connection refused')
    const { provider, callCount } = makeProvider({ throwError: boom })
    const steps: ReasoningStep[] = []
    await expect(async () => {
      for await (const step of runReactLoop('scan', inertTools, new MemoryManager(), {
        provider,
        maxSteps: 3,
        maxProviderRetries: 1,
      })) {
        steps.push(step)
      }
    }).rejects.toThrow(/connection refused/)

    expect(callCount()).toBe(2) // initial attempt + one retry
    expect(steps.some(s => s.type === 'observe' && /provider/i.test(s.content))).toBe(true)
  })

  it('records a failed observation and keeps looping when a tool throws', async () => {
    const { provider } = makeProvider({ responses: ['{"tool":"shell","args":{"command":"ls"}}'] })
    const throwingTools = {
      list: () => [{ name: 'shell', description: 'shell' }],
      execute: async () => {
        throw new Error('sandbox exploded')
      },
    } as unknown as ToolRegistry

    const steps = await collect(runReactLoop('scan', throwingTools, new MemoryManager(), { provider, maxSteps: 2 }))
    const failures = steps.filter(s => s.type === 'observe' && s.content.includes('sandbox exploded'))
    expect(failures.length).toBeGreaterThanOrEqual(1)
    expect(failures[0].content).toMatch(/l'outil shell/i)
  })
})
