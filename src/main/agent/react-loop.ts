import type { ReasoningStep, ReactLoopOptions, ToolCall } from '@shared/types/agent.types'
import type { ModelProvider } from '@shared/types/model.types'
import { MemoryManager } from './memory-manager'
import { SYSTEM_PROMPT } from './prompts/system'
import { TOOL_USE_PROMPTS } from './prompts/tool-use'
import { ToolRegistry } from './tools/registry'

export interface RunReactLoopOptions extends Partial<ReactLoopOptions> {
  provider?: ModelProvider
  signal?: AbortSignal
  /** Number of times a failed provider call is retried before the run aborts. */
  maxProviderRetries?: number
}

const DEFAULT_OPTIONS: ReactLoopOptions = {
  maxSteps: 20,
  timeoutPerStep: 30000,
  totalTimeout: 600000,
  stopConditions: ['FINAL'],
}

const DEFAULT_PROVIDER_RETRIES = 1

export async function* runReactLoop(
  initialPrompt: string,
  tools: ToolRegistry,
  memory: MemoryManager,
  options: RunReactLoopOptions = {},
): AsyncIterable<ReasoningStep> {
  const resolved = { ...DEFAULT_OPTIONS, ...options }
  const started = Date.now()

  memory.add('user', initialPrompt)

  if (!options.provider) {
    yield {
      type: 'reason',
      content: 'Je suis Nexus. Aucun provider IA local n’est connecté pour ce run, donc je m’arrête après cette réponse de diagnostic.',
      metadata: { tokensUsed: 0, durationMs: 0, confidenceScore: 0.5 },
    }
    return
  }

  for (let stepIndex = 0; stepIndex < resolved.maxSteps; stepIndex++) {
    if (options.signal?.aborted) return
    if (Date.now() - started > resolved.totalTimeout) {
      yield {
        type: 'observe',
        content: `Timeout global atteint après ${resolved.totalTimeout}ms.`,
        metadata: { tokensUsed: 0, durationMs: Date.now() - started, confidenceScore: 1 },
      }
      return
    }

    const stepStarted = Date.now()
    const prompt = buildPrompt(initialPrompt, memory, stepIndex, tools)

    let response: { content: string; tokens: number }
    try {
      response = await collectProviderResponse(
        options.provider,
        prompt,
        resolved.timeoutPerStep,
        options.signal,
        options.maxProviderRetries ?? DEFAULT_PROVIDER_RETRIES,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // The provider is unrecoverable for this run: surface the failure as an
      // observation (so it is persisted) and re-throw so the caller marks the
      // run as errored rather than silently completing.
      yield {
        type: 'observe',
        content: `Erreur du provider IA après nouvelles tentatives: ${message}`,
        metadata: { tokensUsed: 0, durationMs: Date.now() - stepStarted, confidenceScore: 0 },
      }
      throw error instanceof Error ? error : new Error(message)
    }

    const reasonStep: ReasoningStep = {
      type: 'reason',
      content: response.content,
      metadata: {
        tokensUsed: response.tokens,
        durationMs: Date.now() - stepStarted,
        confidenceScore: inferConfidence(response.content),
      },
    }
    yield reasonStep
    memory.add('assistant', response.content)

    if (shouldStop(response.content, resolved.stopConditions ?? [])) return

    const toolCall = parseToolCall(response.content)
    if (!toolCall) {
      yield {
        type: 'observe',
        content: 'Aucun appel outil détecté. La boucle s’arrête pour éviter une itération vide.',
        metadata: { tokensUsed: 0, durationMs: Date.now() - stepStarted, confidenceScore: 0.8 },
      }
      return
    }

    yield {
      type: 'act',
      content: `Tool ${toolCall.name} demandé.`,
      toolCall,
      metadata: { tokensUsed: 0, durationMs: 0, confidenceScore: 0.9 },
    }

    let execution: Awaited<ReturnType<ToolRegistry['execute']>>
    try {
      execution = await tools.execute(toolCall)
    } catch (error) {
      // A tool throwing is recoverable: record it as a failed observation and
      // let the loop continue so the model can adapt on the next turn.
      const message = error instanceof Error ? error.message : String(error)
      const failure = `L'exécution de l'outil ${toolCall.name} a échoué: ${message}`
      memory.add('tool', failure)
      yield {
        type: 'observe',
        content: failure,
        toolCall,
        observation: failure,
        metadata: { tokensUsed: 0, durationMs: Date.now() - stepStarted, confidenceScore: 0.3 },
      }
      continue
    }

    const observation = execution.result.observation
    memory.add('tool', observation)

    yield {
      type: 'observe',
      content: observation,
      toolCall: execution.call,
      observation,
      metadata: {
        tokensUsed: 0,
        durationMs: execution.result.durationMs,
        confidenceScore: execution.result.status === 'success' ? 0.9 : 0.6,
      },
    }

    if (execution.result.status === 'requires_approval' || execution.result.status === 'denied') return
  }
}

function buildPrompt(initialPrompt: string, memory: MemoryManager, stepIndex: number, tools: ToolRegistry): string {
  const toolList = tools.list().map(tool => `- ${tool.name}: ${tool.description}`).join('\n')
  return [
    SYSTEM_PROMPT,
    '# Instructions outils',
    TOOL_USE_PROMPTS.shell,
    TOOL_USE_PROMPTS.network,
    TOOL_USE_PROMPTS.filesystem,
    '# Outils enregistrés',
    toolList,
    '# Tâche initiale',
    initialPrompt,
    '# Mémoire récente',
    memory.transcript(),
    `# Tour ReAct courant: ${stepIndex + 1}`,
    'Réponds avec ton raisonnement. Si une action est nécessaire, ajoute exactement un bloc JSON d’appel outil.',
  ].join('\n\n')
}

async function collectProviderResponse(
  provider: ModelProvider,
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal,
  maxRetries = 0,
): Promise<{ content: string; tokens: number }> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) return { content: '', tokens: 0 }
    try {
      return await streamOnce(provider, prompt, timeoutMs, signal)
    } catch (error) {
      lastError = error
      if (attempt < maxRetries && !signal?.aborted) {
        // Exponential backoff (250ms, 500ms, ...) between provider retries.
        await delay(250 * 2 ** attempt, signal)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function streamOnce(
  provider: ModelProvider,
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ content: string; tokens: number }> {
  const started = Date.now()
  let content = ''
  let tokens = 0

  for await (const chunk of provider.chatStream(prompt, { timeoutMs })) {
    if (signal?.aborted) break
    content += chunk.delta
    tokens = chunk.cumulativeTokens
    if (Date.now() - started > timeoutMs) break
  }

  return { content: content.trim(), tokens }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

function parseToolCall(content: string): ToolCall | null {
  const jsonCandidate = extractJsonObject(content)
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as { tool?: string; name?: string; args?: Record<string, unknown> }
      const tool = parsed.tool ?? parsed.name
      if (tool) {
        return {
          id: crypto.randomUUID(),
          name: tool,
          args: parsed.args ?? {},
          status: 'pending',
        }
      }
    } catch {
      // Fall through to markdown parsing.
    }
  }

  const toolMatch = content.match(/\*\*?Tool:\*\*?\s*([^\n\r]+)/i) ?? content.match(/Tool:\s*([^\n\r]+)/i)
  const commandMatch = content.match(/\*\*?Command:\*\*?\s*([^\n\r]+)/i) ?? content.match(/Command:\s*([^\n\r]+)/i)
  if (!toolMatch) return null

  return {
    id: crypto.randomUUID(),
    name: toolMatch[1].trim(),
    args: commandMatch ? { command: commandMatch[1].trim() } : {},
    status: 'pending',
  }
}

function extractJsonObject(content: string): string | null {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()

  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return content.slice(start, end + 1)
}

function shouldStop(content: string, stopConditions: string[]): boolean {
  const normalized = content.trim()
  return stopConditions.some(condition => normalized.toLowerCase().includes(condition.toLowerCase()))
}

function inferConfidence(content: string): number {
  if (/incertain|unknown|je ne sais pas/i.test(content)) return 0.4
  if (/FINAL|Conclusion/i.test(content)) return 0.95
  return 0.75
}
