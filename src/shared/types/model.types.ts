export type ModelProviderType = 'ollama' | 'llamacpp-http' | 'openai-compatible'
export type ModelQuantization = 'Q4_K_M' | 'Q5_K_M' | 'Q8_0'

export interface ModelConfig {
  host: string
  modelPath?: string
  modelName: string
  temperature: number
  topP: number
  topK: number
  contextLength: number
  gpuLayers?: number
  nThreads?: number
  nBatch?: number
  mainGpu?: number
  tensorSplit?: number[]
  flashAttention?: boolean
  useMmap?: boolean
  streamEnabled: boolean
  chunkSize?: number
  useCache: boolean
  maxTokensPerTurn: number
  timeoutMs: number
  maxRetries: number
}

export type ModelConfigInput = Partial<ModelConfig> & {
  host: string
  modelName: string
}

export interface ChatChunk {
  token: string
  delta: string
  cumulativeTokens: number
  timestamp: Date
}

export interface ModelInfo {
  name: string
  version: string
  sizeGB: number
  quantization: ModelQuantization
  contextLength: number
  gpuLayers: number
  providerType: ModelProviderType
  host: string
}

export interface ModelProvider {
  name: string
  type: ModelProviderType
  init(config: ModelConfigInput): Promise<void>
  chatStream(prompt: string, options?: Partial<ModelConfig>): AsyncIterable<ChatChunk>
  embed(texts: string[]): Promise<number[][]>
  getMetadata(): ModelInfo
}

export type ModelRuntimeDevice = 'cpu' | 'gpu'
export type ModelRuntimeState = 'idle' | 'starting' | 'running' | 'error'

export interface LocalModelRecord {
  id: string
  name: string
  path: string
  filename: string
  quantization: ModelQuantization | 'unknown'
  sizeBytes: number
  sourceUrl: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ModelCatalogEntry {
  id: string
  name: string
  family: string
  parameterSize: string
  quantization: ModelQuantization | 'unknown'
  format: 'gguf'
  recommendedContext: number
  notes: string
  downloadUrl?: string
}

export interface ModelLoadOptions {
  modelId: string
  device: ModelRuntimeDevice
  executablePath?: string
  host?: string
  port?: number
  contextLength?: number
  gpuLayers?: number
  threads?: number
  batchSize?: number
  flashAttention?: boolean
  /**
   * Path to a multimodal projector (mmproj*.gguf) that enables image input.
   * Left unset, the runtime auto-detects an mmproj file next to the model.
   */
  mmprojPath?: string
}

export interface ModelRuntimeStatus {
  state: ModelRuntimeState
  device: ModelRuntimeDevice | null
  loadedModelId: string | null
  modelName: string | null
  endpoint: string | null
  pid: number | null
  error: string | null
  startedAt: string | null
}

export interface ModelDownloadRequest {
  url: string
  name?: string
  filename?: string
}

export interface ModelDownloadProgress {
  id: string
  url: string
  filename: string
  downloadedBytes: number
  totalBytes: number | null
  percent: number | null
  status: 'downloading' | 'completed' | 'error'
  error?: string
}
