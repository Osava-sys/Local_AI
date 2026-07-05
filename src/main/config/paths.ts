import { app } from 'electron'
import { join } from 'path'

export function getDbPath(): string {
  return join(app.getPath('userData'), 'local-ai.db')
}

export function getMigrationsDir(): string {
  return join(app.getAppPath(), 'src', 'main', 'storage', 'migrations')
}
