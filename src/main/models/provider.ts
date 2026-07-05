import type {
  ChatChunk,
  ModelConfig,
  ModelConfigInput,
  ModelInfo,
  ModelProvider,
  ModelProviderType,
} from '@shared/types/model.types'

export type { ChatChunk, ModelConfig, ModelConfigInput, ModelInfo, ModelProvider, ModelProviderType }

export const DEFAULT_MODEL_CONFIG: Omit<ModelConfig, 'host' | 'modelName'> = {
  modelPath: '',
  temperature: 0.8,
  topP: 0.9,
  topK: 40,
  contextLength: 32768,
  gpuLayers: 35,
  nThreads: 8,
  nBatch: 512,
  mainGpu: 0,
  tensorSplit: [1],
  flashAttention: true,
  useMmap: false,
  streamEnabled: true,
  chunkSize: 1,
  useCache: true,
  maxTokensPerTurn: 2048,
  timeoutMs: 60000,
  maxRetries: 2,
}

export function normalizeModelConfig(config: ModelConfigInput): ModelConfig {
  return {
    ...DEFAULT_MODEL_CONFIG,
    ...config,
  }
}
