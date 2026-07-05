import type BetterSqlite3 from 'better-sqlite3'
import type { LocalModelRecord, ModelQuantization } from '@shared/types/model.types'

interface LocalModelRow {
  id: string
  name: string
  path: string
  filename: string
  quantization: ModelQuantization | 'unknown'
  sizeBytes: number
  sourceUrl: string | null
  isActive: 0 | 1
  createdAt: string
  updatedAt: string
}

export interface UpsertLocalModelInput {
  id: string
  name: string
  path: string
  filename: string
  quantization: ModelQuantization | 'unknown'
  sizeBytes: number
  sourceUrl?: string | null
}

function mapRow(row: LocalModelRow): LocalModelRecord {
  return {
    ...row,
    isActive: row.isActive === 1,
  }
}

export class ModelsRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  list(): LocalModelRecord[] {
    const rows = this.db
      .prepare(`
        SELECT
          id,
          name,
          path,
          filename,
          quantization,
          size_bytes as sizeBytes,
          source_url as sourceUrl,
          is_active as isActive,
          created_at as createdAt,
          updated_at as updatedAt
        FROM local_models
        ORDER BY is_active DESC, updated_at DESC
      `)
      .all() as LocalModelRow[]
    return rows.map(mapRow)
  }

  findById(id: string): LocalModelRecord | null {
    const row = this.db
      .prepare(`
        SELECT
          id,
          name,
          path,
          filename,
          quantization,
          size_bytes as sizeBytes,
          source_url as sourceUrl,
          is_active as isActive,
          created_at as createdAt,
          updated_at as updatedAt
        FROM local_models
        WHERE id = ?
      `)
      .get(id) as LocalModelRow | undefined
    return row ? mapRow(row) : null
  }

  active(): LocalModelRecord | null {
    const row = this.db
      .prepare(`
        SELECT
          id,
          name,
          path,
          filename,
          quantization,
          size_bytes as sizeBytes,
          source_url as sourceUrl,
          is_active as isActive,
          created_at as createdAt,
          updated_at as updatedAt
        FROM local_models
        WHERE is_active = 1
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .get() as LocalModelRow | undefined
    return row ? mapRow(row) : null
  }

  upsert(input: UpsertLocalModelInput): LocalModelRecord {
    this.db
      .prepare(`
        INSERT INTO local_models (id, name, path, filename, quantization, size_bytes, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          name = excluded.name,
          filename = excluded.filename,
          quantization = excluded.quantization,
          size_bytes = excluded.size_bytes,
          source_url = excluded.source_url,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `)
      .run(input.id, input.name, input.path, input.filename, input.quantization, input.sizeBytes, input.sourceUrl ?? null)

    const record = this.db
      .prepare('SELECT id FROM local_models WHERE path = ?')
      .get(input.path) as { id: string }
    return this.findById(record.id)!
  }

  markActive(id: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE local_models SET is_active = 0').run()
      this.db
        .prepare(`
          UPDATE local_models
          SET is_active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `)
        .run(id)
    })
    tx()
  }
}
