import { describe, it, expect } from 'vitest'
import type { ChatChunk, ModelInfo, ModelProvider } from '@shared/types/model.types'
import type { ReasoningStep, ToolCall } from '@shared/types/agent.types'
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

function makeProvider(opts: FakeProviderOptions): {
  provider: ModelProvider
  callCount: () => number
} {
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

function successfulTools(observation = 'sandbox observation'): ToolRegistry {
  return {
    list: () => [{ name: 'shell', description: 'runs a shell command' }],
    execute: async (call: ToolCall) => ({
      call: { ...call, status: 'done' },
      intent: { id: call.id, kind: 'shell', command: String(call.args['command'] ?? '') },
      result: {
        id: call.id,
        kind: 'shell',
        status: 'success',
        observation,
        exitCode: 0,
        startedAt: 'a',
        endedAt: 'b',
        durationMs: 1,
      },
    }),
  } as ToolRegistry
}

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
    const steps = await collect(
      runReactLoop('scan', inertTools, new MemoryManager(), { provider, maxSteps: 5 })
    )
    expect(steps).toHaveLength(1)
    expect(steps[0].type).toBe('reason')
  })

  it('does not stop when FINAL appears only inside a normal word before an action', async () => {
    const response = [
      '# REASONING',
      'Finalement, je corrèle les PID avec netstat.',
      '# ACTION',
      '```json',
      '{"tool":"shell.tool.ts","args":{"command":"netstat -ano","timeoutMs":30000}}',
      '```',
    ].join('\n')
    const { provider } = makeProvider({ responses: [response] })

    const steps = await collect(
      runReactLoop('scan', successfulTools('netstat observation'), new MemoryManager(), {
        provider,
        maxSteps: 1,
      })
    )

    expect(steps.map((step) => step.type)).toEqual(['reason', 'act', 'observe', 'reason'])
    expect(
      steps.some((step) => step.type === 'observe' && step.content === 'netstat observation')
    ).toBe(true)
  })

  it('executes the first valid action when the model emits multiple tilde-fenced JSON blocks', async () => {
    const response = [
      'REASONING: je dois tester HTTP puis PostgreSQL, mais une seule action doit partir.',
      '~~~json',
      '{"tool":"shell.tool.ts","args":{"command":"curl","args":["-s","http://127.0.0.1:8080/robots.txt"]}}',
      '~~~',
      '~~~json',
      '{"tool":"shell.tool.ts","args":{"command":"nc","args":["-z","127.0.0.1","5432"]}}',
      '~~~',
    ].join('\n')
    const { provider } = makeProvider({ responses: [response] })

    const steps = await collect(
      runReactLoop('scan', successfulTools('robots observation'), new MemoryManager(), {
        provider,
        maxSteps: 1,
      })
    )

    const action = steps.find((step) => step.type === 'act')?.toolCall
    expect(action?.name).toBe('shell.tool.ts')
    expect(action?.args).toMatchObject({
      command: 'curl',
      args: ['-s', 'http://127.0.0.1:8080/robots.txt'],
    })
    expect(
      steps.some((step) => step.type === 'observe' && step.content === 'robots observation')
    ).toBe(true)
  })

  it('recovers a valid tool action from fenced JSON with trailing punctuation', async () => {
    const response = [
      '# REASONING',
      'Je lance une commande locale minimale.',
      '# ACTION',
      '```json',
      '{',
      '  "tool": "shell.tool.ts",',
      '  "args": {',
      '    "command": "ipconfig /all",',
      '    "timeoutMs": 30000,',
      '    "cwd": ".",',
      '    "environment": {}',
      '  }',
      '}..',
      '```',
    ].join('\n')
    const { provider } = makeProvider({ responses: [response] })

    const steps = await collect(
      runReactLoop(
        'diagnostic local',
        successfulTools('ipconfig observation'),
        new MemoryManager(),
        {
          provider,
          maxSteps: 1,
        }
      )
    )

    const action = steps.find((step) => step.type === 'act')?.toolCall
    expect(action?.name).toBe('shell.tool.ts')
    expect(action?.args).toMatchObject({
      command: 'ipconfig /all',
      timeoutMs: 30000,
      cwd: '.',
      environment: {},
    })
    expect(
      steps.some((step) => step.type === 'observe' && step.content === 'ipconfig observation')
    ).toBe(true)
  })

  it('stops with an observation when the model requests no tool', async () => {
    const { provider } = makeProvider({ responses: ['Je reflechis, pas d action pour le moment.'] })
    const steps = await collect(
      runReactLoop('scan', inertTools, new MemoryManager(), { provider, maxSteps: 5 })
    )
    expect(steps.map((s) => s.type)).toEqual(['reason', 'observe'])
    expect(steps[1].content).toMatch(/aucun appel outil/i)
  })

  it('redacts unsupported Windows product and edition claims from model reasoning', async () => {
    const { provider } = makeProvider({
      responses: ['FINAL: Hote confirme Windows 10 Pro build 26200.'],
    })
    const steps = await collect(
      runReactLoop('scan', inertTools, new MemoryManager(), { provider, maxSteps: 1 })
    )

    expect(steps[0].content).not.toContain('Windows 10 Pro')
    expect(steps[0].content).toContain(
      'Windows (produit/édition non déterminé par les observations)'
    )
  })

  it('redacts unsupported RCE and CVE claims when observations contain no vulnerability evidence', async () => {
    const { provider } = makeProvider({
      responses: ['FINAL: SMB 445 confirme une RCE CVE-2024-12345.'],
    })
    const steps = await collect(
      runReactLoop('scan', inertTools, new MemoryManager(), { provider, maxSteps: 1 })
    )

    expect(steps[0].content).not.toContain('RCE')
    expect(steps[0].content).not.toContain('CVE-2024-12345')
    expect(steps[0].content).toContain('vulnérabilité non déterminée')
    expect(steps[0].content).toContain('CVE non déterminée')
  })

  it('recovers once when the model response is truncated before an action JSON', async () => {
    const { provider, callCount } = makeProvider({
      responses: [
        '# REASONING\nJe dois corréler les PID.\n**Stratégie :** Exécut',
        '{"tool":"shell","args":{"command":"tasklist"}}',
      ],
    })

    const steps = await collect(
      runReactLoop('scan', successfulTools('tasklist observation'), new MemoryManager(), {
        provider,
        maxSteps: 2,
      })
    )

    expect(callCount()).toBe(2)
    expect(
      steps.some(
        (step) => step.type === 'observe' && /Réponse modèle incomplète/.test(step.content)
      )
    ).toBe(true)
    expect(
      steps.some((step) => step.type === 'observe' && step.content === 'tasklist observation')
    ).toBe(true)
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
    expect(steps.some((s) => s.type === 'observe' && /provider/i.test(s.content))).toBe(true)
  })

  it('records a failed observation and keeps looping when a tool throws', async () => {
    const { provider } = makeProvider({ responses: ['{"tool":"shell","args":{"command":"ls"}}'] })
    const throwingTools = {
      list: () => [{ name: 'shell', description: 'shell' }],
      execute: async () => {
        throw new Error('sandbox exploded')
      },
    } as unknown as ToolRegistry

    const steps = await collect(
      runReactLoop('scan', throwingTools, new MemoryManager(), { provider, maxSteps: 2 })
    )
    const failures = steps.filter(
      (s) => s.type === 'observe' && s.content.includes('sandbox exploded')
    )
    expect(failures.length).toBeGreaterThanOrEqual(1)
    expect(failures[0].content).toMatch(/l'outil shell/i)
  })

  it('strips model-authored observation sections before acting or persisting', async () => {
    const response = [
      'REASONING: je vais verifier le port.',
      '## OBSERVATION',
      'En attente du resultat du sandbox...',
      '```json',
      '{"tool":"shell","args":{"command":"echo","args":["ok"]}}',
      '```',
    ].join('\n')
    const { provider } = makeProvider({ responses: [response] })

    const steps = await collect(
      runReactLoop('scan', successfulTools('real sandbox observation'), new MemoryManager(), {
        provider,
        maxSteps: 1,
      })
    )

    expect(steps[0].type).toBe('reason')
    expect(steps[0].content).not.toContain('OBSERVATION')
    expect(steps[0].content).not.toContain('En attente')
    expect(
      steps.some((step) => step.type === 'observe' && step.content === 'real sandbox observation')
    ).toBe(true)
    expect(
      steps.some((step) => step.type === 'observe' && step.content.includes('En attente'))
    ).toBe(false)
  })

  it('emits a grounded FINAL summary when maxSteps is reached without FINAL', async () => {
    const { provider } = makeProvider({
      responses: ['{"tool":"shell","args":{"command":"echo","args":["ok"]}}'],
    })

    const steps = await collect(
      runReactLoop('scan', successfulTools('ok'), new MemoryManager(), {
        provider,
        maxSteps: 1,
      })
    )

    expect(steps.at(-1)?.type).toBe('reason')
    expect(steps.at(-1)?.content).toMatch(/Max steps reached/)
    expect(steps.at(-1)?.content).toMatch(/^FINAL:/)
    expect(steps.at(-1)?.stopReason).toBe('max_steps')
  })

  it('emits a grounded FINAL when the model stalls after real tool observations', async () => {
    const { provider } = makeProvider({
      responses: [
        '{"tool":"shell","args":{"command":"curl","args":["-I","http://127.0.0.1:8080"]}}',
        '##',
      ],
    })

    const steps = await collect(
      runReactLoop(
        'scan',
        successfulTools('127.0.0.1:8080/tcp open durationMs=1\nServer: Apache'),
        new MemoryManager(),
        {
          provider,
          maxSteps: 3,
        }
      )
    )

    const final = steps.at(-1)
    expect(final?.type).toBe('reason')
    expect(final?.content).toMatch(/^FINAL:/)
    expect(final?.content).toContain("n'a pas fourni de nouvel appel outil")
    expect(final?.content).toContain('8080')
    expect(final?.stopReason).toBe('no_tool')
  })

  it('includes confirmed open ports and hardening advice in the maxSteps FINAL', async () => {
    const { provider } = makeProvider({
      responses: ['{"tool":"shell","args":{"command":"echo","args":["ok"]}}'],
    })
    const observation = [
      '127.0.0.1:5432/tcp open durationMs=1',
      '127.0.0.1:27017/tcp open durationMs=1',
      '127.0.0.1:80/tcp closed durationMs=1',
      'TCP 0.0.0.0:5432 state=LISTENING pid=8016 exposure=all_interfaces',
      'pid=8016 process=postgres.exe',
    ].join('\n')

    const steps = await collect(
      runReactLoop('scan', successfulTools(observation), new MemoryManager(), {
        provider,
        maxSteps: 1,
      })
    )

    const final = steps.at(-1)?.content ?? ''
    expect(final).toContain('5432 (PostgreSQL)')
    expect(final).toContain('27017 (MongoDB)')
    expect(final).toContain('pg_hba.conf')
    expect(final).toContain('bind 127.0.0.1')
    expect(final).toContain('Rapport JSON')
    expect(final).toContain('"riskScore"')
    expect(final).toContain('"servicesDetected"')
  })

  it('deduplicates dual-stack netstat findings and filters noisy dynamic sockets in the final report', async () => {
    const { provider } = makeProvider({
      responses: ['{"tool":"shell","args":{"command":"netstat -ano"}}'],
    })
    const observation = [
      'TCP 0.0.0.0:5432 state=LISTENING pid=8016 exposure=all_interfaces',
      'TCP [::]:5432 state=LISTENING pid=8016 exposure=all_interfaces',
      'TCP 0.0.0.0:49664 state=LISTENING pid=4 exposure=all_interfaces',
      'pid=8016 process=postgres.exe',
    ].join('\n')

    const steps = await collect(
      runReactLoop('scan', successfulTools(observation), new MemoryManager(), {
        provider,
        maxSteps: 1,
      })
    )

    const final = steps.at(-1)?.content ?? ''
    expect(final).toContain('MEDIUM score=24/100 0.0.0.0:5432/tcp postgresql')
    expect(final).toContain('"riskScore": 24')
    expect(final).toContain('"priority": "MEDIUM"')
    expect(final).not.toContain('"port": 49664')
    expect(
      final.match(/5432\/tcp postgresql exposure=all_interfaces score=24/g) ?? []
    ).toHaveLength(1)
  })
})
