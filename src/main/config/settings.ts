import type BetterSqlite3 from 'better-sqlite3'
import { SettingsRepository } from '../storage/repositories/settings.repository'

let _repo: SettingsRepository | null = null

export function initSettingsService(db: BetterSqlite3.Database): void {
  _repo = new SettingsRepository(db)
}

function repo(): SettingsRepository {
  if (!_repo) throw new Error('Settings service not initialized')
  return _repo
}

export const settingsService = {
  get: (key: string): string | null => repo().get(key),
  set: (key: string, value: string): void => repo().set(key, value),
  getAll: (): Record<string, string> => repo().getAll(),
}
