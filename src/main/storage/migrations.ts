import type { Database } from 'better-sqlite3'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

export function runMigrations(db: Database, migrationsDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)

  const applied = new Set<string>(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(r => r.name)
  )

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const insert = db.prepare('INSERT INTO _migrations (name) VALUES (?)')

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    db.exec(sql)
    insert.run(file)
    console.log(`[migrations] applied ${file}`)
  }
}
