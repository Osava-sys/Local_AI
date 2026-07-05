import { app, dialog, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import type { Result } from '@shared/types/ipc.types'
import type { LocalModelRecord, ModelCatalogEntry, ModelRuntimeStatus } from '@shared/types/model.types'
import {
  ModelDownloadPayloadSchema,
  ModelLoadPayloadSchema,
  ModelRegisterLocalPayloadSchema,
} from '@shared/validation/model.schema'
import { listCatalogModels } from '../models/catalog'
import { ModelDownloader } from '../models/downloader'
import { LlamaCppRuntime } from '../models/model-runtime'
import { LocalModelRegistry } from '../models/registry'
import { getDb } from '../storage/db-client'

let runtime: LlamaCppRuntime | null = null

function registry(): LocalModelRegistry {
  return new LocalModelRegistry(getDb())
}

function getRuntime(event: IpcMainInvokeEvent): LlamaCppRuntime {
  if (!runtime) runtime = new LlamaCppRuntime(app.getAppPath(), event.sender)
  return runtime
}

export function handleModelCatalog(): Result<ModelCatalogEntry[]> {
  return { ok: true, value: listCatalogModels() }
}

export function handleModelList(): Result<LocalModelRecord[]> {
  return { ok: true, value: registry().list() }
}

export async function handleModelSelectGguf(): Promise<Result<{ path: string } | null>> {
  const result = await dialog.showOpenDialog({
    title: 'Select GGUF model',
    properties: ['openFile'],
    filters: [{ name: 'GGUF models', extensions: ['gguf'] }],
  })

  if (result.canceled || result.filePaths.length === 0) return { ok: true, value: null }
  return { ok: true, value: { path: result.filePaths[0] } }
}

export function handleModelRegisterLocal(_event: IpcMainInvokeEvent, payload: unknown): Result<LocalModelRecord> {
  const parsed = ModelRegisterLocalPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  try {
    return {
      ok: true,
      value: registry().registerLocal(parsed.data.path, parsed.data.name),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleModelDownload(event: IpcMainInvokeEvent, payload: unknown): Promise<Result<LocalModelRecord>> {
  const parsed = ModelDownloadPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  try {
    const downloader = new ModelDownloader(registry(), join(app.getPath('userData'), 'models'), event.sender)
    const model = await downloader.download(parsed.data)
    return { ok: true, value: model }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleModelLoad(event: IpcMainInvokeEvent, payload: unknown): Promise<Result<ModelRuntimeStatus>> {
  const parsed = ModelLoadPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  try {
    const localRegistry = registry()
    const model = localRegistry.findById(parsed.data.modelId)
    if (!model) return { ok: false, error: `Model not found: ${parsed.data.modelId}` }

    const status = await getRuntime(event).load(model, parsed.data)
    if (status.state === 'running') localRegistry.markActive(model.id)
    return { ok: true, value: status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleModelUnload(event: IpcMainInvokeEvent): Promise<Result<void>> {
  try {
    await getRuntime(event).unload()
    return { ok: true, value: undefined }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function handleModelStatus(event: IpcMainInvokeEvent): Result<ModelRuntimeStatus> {
  return { ok: true, value: getRuntime(event).getStatus() }
}
