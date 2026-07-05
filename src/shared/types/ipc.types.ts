import type { Chat, Message } from './chat.types'
import type { AgentRun, AgentRunStep, AgentStartPayload } from './agent.types'
import type {
  LocalModelRecord,
  ModelCatalogEntry,
  ModelDownloadProgress,
  ModelDownloadRequest,
  ModelLoadOptions,
  ModelRuntimeStatus,
} from './model.types'

export interface AgentEventMap {
  step: AgentRunStep
  state: { runId: string; state: string }
  error: { runId?: string; error: string }
}

export interface ModelEventMap {
  downloadProgress: ModelDownloadProgress
  runtimeState: ModelRuntimeStatus
}

export type IpcChannel =
  | 'ping'
  | 'settings:get'
  | 'settings:set'
  | 'settings:getAll'
  | 'chat:list'
  | 'chat:create'
  | 'chat:delete'
  | 'message:list'
  | 'message:create'
  | 'agent:start'
  | 'agent:stop'
  | 'agent:get'
  | 'model:catalog'
  | 'model:list'
  | 'model:selectGguf'
  | 'model:registerLocal'
  | 'model:download'
  | 'model:load'
  | 'model:unload'
  | 'model:status'

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export interface IpcRequest<T = unknown> {
  channel: IpcChannel
  payload: T
}

export interface IpcResult<T = unknown> {
  channel: IpcChannel
  result: Result<T>
}

export interface ExposedApi {
  ping(): Promise<string>
  settings: {
    get(key: string): Promise<Result<string | null>>
    set(key: string, value: string): Promise<Result<void>>
    getAll(): Promise<Result<Record<string, string>>>
  }
  chat: {
    list(): Promise<Result<Chat[]>>
    create(title?: string): Promise<Result<Chat>>
    delete(id: string): Promise<Result<void>>
  }
  message: {
    list(chatId: string): Promise<Result<Message[]>>
    create(chatId: string, role: string, content: string, model?: string): Promise<Result<Message>>
  }
  agent: {
    start(workspaceId: string, prompt: string, options?: AgentStartPayload['options']): Promise<Result<{ runId: string }>>
    stop(runId: string): Promise<Result<void>>
    get(runId: string): Promise<Result<AgentRun>>
    on<K extends keyof AgentEventMap>(event: K, callback: (payload: AgentEventMap[K]) => void): () => void
  }
  model: {
    catalog(): Promise<Result<ModelCatalogEntry[]>>
    list(): Promise<Result<LocalModelRecord[]>>
    selectGguf(): Promise<Result<{ path: string } | null>>
    registerLocal(path: string, name?: string): Promise<Result<LocalModelRecord>>
    download(request: ModelDownloadRequest): Promise<Result<LocalModelRecord>>
    load(options: ModelLoadOptions): Promise<Result<ModelRuntimeStatus>>
    unload(): Promise<Result<void>>
    status(): Promise<Result<ModelRuntimeStatus>>
    on<K extends keyof ModelEventMap>(event: K, callback: (payload: ModelEventMap[K]) => void): () => void
  }
}
