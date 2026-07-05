import type { IpcMainInvokeEvent } from 'electron'
import type { Result } from '@shared/types/ipc.types'
import { SettingsGetPayloadSchema, SettingsSetPayloadSchema } from '@shared/validation/settings.schema'
import { settingsService } from '../config/settings'

export function handleSettingsGet(_e: IpcMainInvokeEvent, payload: unknown): Result<string | null> {
  const parsed = SettingsGetPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  return { ok: true, value: settingsService.get(parsed.data.key) }
}

export function handleSettingsSet(_e: IpcMainInvokeEvent, payload: unknown): Result<void> {
  const parsed = SettingsSetPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  settingsService.set(parsed.data.key, parsed.data.value)
  return { ok: true, value: undefined }
}

export function handleSettingsGetAll(_e: IpcMainInvokeEvent, _payload: unknown): Result<Record<string, string>> {
  return { ok: true, value: settingsService.getAll() }
}
