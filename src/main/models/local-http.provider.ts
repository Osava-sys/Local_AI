import {
  DEFAULT_MODEL_CONFIG,
  normalizeModelConfig,
  type ChatChunk,
  type ModelConfig,
  type ModelConfigInput,
  type ModelInfo,
  type ModelProvider,
} from './provider'

type HttpMode = 'ollama-generate' | 'openai-chat'

interface ProviderResponseError {
  error?: string
  message?: string
}

const FALLBACK_VECTOR_SIZE = 384

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function inferMode(host: string): HttpMode {
  if (host.includes('/v1/chat/completions')) return 'openai-chat'
  if (host.includes('/api/generate')) return 'ollama-generate'
  if (host.includes('/v1')) return 'openai-chat'
  return 'ollama-generate'
}

function buildChatEndpoint(host: string, mode: HttpMode): string {
  const base = trimTrailingSlash(host)
  if (base.endsWith('/api/generate') || base.endsWith('/v1/chat/completions')) return base
  if (mode === 'openai-chat') {
    return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  }
  return `${base}/api/generate`
}

function buildEmbeddingEndpoint(host: string, mode: HttpMode): string {
  const base = trimTrailingSlash(host)
  if (mode === 'openai-chat') {
    const root = base.endsWith('/v1/chat/completions') ? base.slice(0, -'/chat/completions'.length) : base
    return root.endsWith('/v1') ? `${root}/embeddings` : `${root}/v1/embeddings`
  }
  if (base.endsWith('/api/generate')) return `${base.slice(0, -'/generate'.length)}/embeddings`
  return `${base}/api/embeddings`
}

function extractTextFromStreamingJson(raw: unknown): string {
  const value = raw as {
    response?: string
    message?: { content?: string }
    choices?: Array<{ delta?: { content?: string }; text?: string }>
  }
  return value.response ?? value.message?.content ?? value.choices?.[0]?.delta?.content ?? value.choices?.[0]?.text ?? ''
}

function extractEmbedding(raw: unknown): number[] | number[][] | null {
  const value = raw as {
    embedding?: number[]
    embeddings?: number[][]
    data?: Array<{ embedding?: number[] }>
  }
  if (Array.isArray(value.embedding)) return value.embedding
  if (Array.isArray(value.embeddings)) return value.embeddings
  if (Array.isArray(value.data)) return value.data.map(item => item.embedding ?? [])
  return null
}

function makeStableFallbackEmbedding(text: string): number[] {
  const vector = Array.from({ length: FALLBACK_VECTOR_SIZE }, () => 0)
  for (let i = 0; i < text.length; i++) {
    const index = i % FALLBACK_VECTOR_SIZE
    vector[index] += (text.charCodeAt(i) % 97) / 97
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map(value => value / norm)
}

export class LlamaCppHttpProvider implements ModelProvider {
  name = 'llama.cpp HTTP'
  type = 'llamacpp-http' as const

  private modelConfig: ModelConfig = normalizeModelConfig({
    host: 'http://127.0.0.1:8080',
    modelName: 'qwen3.5-9b-q8_0.gguf',
  })

  private mode: HttpMode = inferMode(this.modelConfig.host)
  private embeddingCache = new Map<string, number[]>()

  async init(config: ModelConfigInput): Promise<void> {
    this.modelConfig = normalizeModelConfig(config)
    this.mode = inferMode(this.modelConfig.host)

    try {
      await this.healthCheck()
    } catch (error) {
      if (this.modelConfig.gpuLayers && this.modelConfig.gpuLayers > 0) {
        this.modelConfig = {
          ...this.modelConfig,
          gpuLayers: 0,
        }
      }
      throw error
    }
  }

  async *chatStream(prompt: string, options?: Partial<ModelConfig>): AsyncIterable<ChatChunk> {
    const config = { ...this.modelConfig, ...options }
    const endpoint = buildChatEndpoint(config.host, this.mode)
    const body = this.buildChatBody(prompt, config)
    let cumulativeTokens = 0

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          const details = await this.safeErrorBody(response)
          throw new Error(`Model HTTP error ${response.status}: ${details}`)
        }

        for await (const line of this.streamLines(response)) {
          const cleaned = line.startsWith('data:') ? line.slice(5).trim() : line.trim()
          if (!cleaned || cleaned === '[DONE]') continue

          const parsed = JSON.parse(cleaned) as unknown
          const token = extractTextFromStreamingJson(parsed)
          if (!token) continue

          cumulativeTokens += 1
          yield {
            token,
            delta: token,
            cumulativeTokens,
            timestamp: new Date(),
          }
        }

        return
      } catch (error) {
        if (attempt >= config.maxRetries) throw error
        await sleep(250 * 2 ** attempt)
      } finally {
        clearTimeout(timeout)
      }
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const uncached = texts.filter(text => !this.embeddingCache.has(text))

    if (uncached.length > 0) {
      try {
        await this.fetchEmbeddings(uncached)
      } catch {
        for (const text of uncached) {
          this.embeddingCache.set(text, makeStableFallbackEmbedding(text))
        }
      }
    }

    return texts.map(text => this.embeddingCache.get(text) ?? makeStableFallbackEmbedding(text))
  }

  getMetadata(): ModelInfo {
    return {
      name: this.modelConfig.modelName,
      version: 'local-http',
      sizeGB: this.modelConfig.modelName.toLowerCase().includes('9b') ? 7.5 : 0,
      quantization: this.modelConfig.modelName.toUpperCase().includes('Q8_0') ? 'Q8_0' : 'Q4_K_M',
      contextLength: this.modelConfig.contextLength,
      gpuLayers: this.modelConfig.gpuLayers ?? 0,
      providerType: this.type,
      host: this.modelConfig.host,
    }
  }

  private async healthCheck(): Promise<void> {
    const root = trimTrailingSlash(this.modelConfig.host)
      .replace(/\/api\/generate$/, '')
      .replace(/\/v1\/chat\/completions$/, '')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.min(this.modelConfig.timeoutMs, 5000))

    try {
      const response = await fetch(root, { method: 'GET', signal: controller.signal })
      if (response.status >= 500) {
        throw new Error(`Model server unhealthy: HTTP ${response.status}`)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private buildChatBody(prompt: string, config: ModelConfig): Record<string, unknown> {
    if (this.mode === 'openai-chat') {
      return {
        model: config.modelName,
        messages: [{ role: 'user', content: prompt }],
        stream: config.streamEnabled,
        temperature: config.temperature,
        top_p: config.topP,
        max_tokens: config.maxTokensPerTurn,
      }
    }

    return {
      model: config.modelName,
      prompt,
      stream: config.streamEnabled,
      options: {
        temperature: config.temperature,
        top_p: config.topP,
        top_k: config.topK,
        num_ctx: config.contextLength,
        num_predict: config.maxTokensPerTurn,
        num_gpu: config.gpuLayers ?? DEFAULT_MODEL_CONFIG.gpuLayers,
        main_gpu: config.mainGpu,
        tensor_split: config.tensorSplit,
        num_thread: config.nThreads,
        num_batch: config.nBatch,
        flash_attn: config.flashAttention,
        use_mmap: config.useMmap,
      },
    }
  }

  private async fetchEmbeddings(texts: string[]): Promise<void> {
    const endpoint = buildEmbeddingEndpoint(this.modelConfig.host, this.mode)

    if (this.mode === 'openai-chat') {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.modelConfig.modelName, input: texts }),
      })
      if (!response.ok) throw new Error(`Embedding HTTP error ${response.status}`)
      const parsed = extractEmbedding(await response.json())
      if (!Array.isArray(parsed)) throw new Error('Invalid embedding response')
      const vectors = Array.isArray(parsed[0]) ? (parsed as number[][]) : [parsed as number[]]
      texts.forEach((text, index) => this.embeddingCache.set(text, vectors[index] ?? makeStableFallbackEmbedding(text)))
      return
    }

    for (const text of texts) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.modelConfig.modelName, prompt: text }),
      })
      if (!response.ok) throw new Error(`Embedding HTTP error ${response.status}`)
      const parsed = extractEmbedding(await response.json())
      this.embeddingCache.set(text, Array.isArray(parsed) && !Array.isArray(parsed[0]) ? parsed as number[] : makeStableFallbackEmbedding(text))
    }
  }

  private async *streamLines(response: Response): AsyncIterable<string> {
    const decoder = new TextDecoder()
    const reader = response.body?.getReader()
    if (!reader) return

    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) yield line
    }

    buffer += decoder.decode()
    if (buffer.trim()) yield buffer
  }

  private async safeErrorBody(response: Response): Promise<string> {
    try {
      const parsed = await response.json() as ProviderResponseError
      return parsed.error ?? parsed.message ?? JSON.stringify(parsed)
    } catch {
      try {
        return await response.text()
      } catch {
        return 'unknown error'
      }
    }
  }
}

export default LlamaCppHttpProvider
