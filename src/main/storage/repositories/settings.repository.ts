import type BetterSqlite3 from 'better-sqlite3'

export class SettingsRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  get(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO UPDATE SET
          value      = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(key, value)
  }

  getAll(): Record<string, string> {
    const rows = this.db
      .prepare('SELECT key, value FROM settings')
      .all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  }
}
