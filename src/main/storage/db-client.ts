import type BetterSqlite3 from 'better-sqlite3'

let _db: BetterSqlite3.Database | null = null

export function setDb(db: BetterSqlite3.Database): void {
  _db = db
}

export function getDb(): BetterSqlite3.Database {
  if (!_db) throw new Error('Database not initialized — call initDb() first')
  return _db
}
