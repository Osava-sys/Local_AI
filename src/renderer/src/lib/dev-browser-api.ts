import type {
  AgentEventMap,
  ApprovalEventMap,
  ExposedApi,
  ModelEventMap,
  Result,
} from '@shared/types/ipc.types'

const PREVIEW_ERROR = 'Action indisponible dans l’aperçu navigateur de développement.'

/**
 * Read-only IPC substitute used only when Vite serves the renderer outside
 * Electron. Every mutation fails closed; the real preload always takes priority.
 */
export function createDevBrowserApi(): ExposedApi {
  const unavailable = async <T>(): Promise<Result<T>> => ({ ok: false, error: PREVIEW_ERROR })
  const off = (): void => undefined
  const onAgent = <K extends keyof AgentEventMap>(
    _event: K,
    _callback: (payload: AgentEventMap[K]) => void
  ): (() => void) => off
  const onModel = <K extends keyof ModelEventMap>(
    _event: K,
    _callback: (payload: ModelEventMap[K]) => void
  ): (() => void) => off
  const onApproval = <K extends keyof ApprovalEventMap>(
    _event: K,
    _callback: (payload: ApprovalEventMap[K]) => void
  ): (() => void) => off

  return {
    ping: async () => 'nexus-browser-preview',
    settings: {
      get: async (key) => ({ ok: true, value: key === 'theme' ? 'dark' : null }),
      set: unavailable,
      getAll: async () => ({ ok: true, value: { theme: 'dark' } }),
    },
    chat: { list: unavailable, create: unavailable, delete: unavailable },
    message: { list: unavailable, create: unavailable },
    agent: { start: unavailable, stop: unavailable, get: unavailable, on: onAgent },
    model: {
      catalog: unavailable,
      list: unavailable,
      selectGguf: unavailable,
      selectLlamaServer: unavailable,
      detectMmproj: unavailable,
      registerLocal: unavailable,
      download: unavailable,
      load: unavailable,
      unload: unavailable,
      status: unavailable,
      on: onModel,
    },
    approval: {
      list: async () => ({ ok: true, value: [] }),
      approve: unavailable,
      reject: unavailable,
      on: onApproval,
    },
  }
}
