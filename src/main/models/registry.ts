import type BetterSqlite3 from 'better-sqlite3'
import type { LocalModelRecord } from '@shared/types/model.types'
import { ModelsRepository } from '../storage/repositories/models.repository'
import { getModelFileInfo } from './resources'

export class LocalModelRegistry {
  private readonly repo: ModelsRepository

  constructor(db: BetterSqlite3.Database) {
    this.repo = new ModelsRepository(db)
  }

  list(): LocalModelRecord[] {
    return this.repo.list()
  }

  active(): LocalModelRecord | null {
    return this.repo.active()
  }

  findById(id: string): LocalModelRecord | null {
    return this.repo.findById(id)
  }

  registerLocal(filePath: string, name?: string, sourceUrl?: string | null): LocalModelRecord {
    const info = getModelFileInfo(filePath)
    return this.repo.upsert({
      id: crypto.randomUUID(),
      name: name ?? info.filename.replace(/\.gguf$/i, ''),
      path: filePath,
      filename: info.filename,
      quantization: info.quantization,
      sizeBytes: info.sizeBytes,
      sourceUrl,
    })
  }

  markActive(id: string): void {
    this.repo.markActive(id)
  }
}
