import type BetterSqlite3 from 'better-sqlite3'

export interface AuditEntry {
  actor: string
  action: string
  targetType?: string
  targetId?: string
  meta?: Record<string, unknown>
}

export class AuditRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  append(entry: AuditEntry): void {
    this.db
      .prepare(`
        INSERT INTO audit_log (actor, action, target_type, target_id, meta)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        entry.actor,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.meta ? JSON.stringify(entry.meta) : null,
      )
  }

  recent(limit = 100): unknown[] {
    return this.db
      .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?')
      .all(limit)
  }
}
