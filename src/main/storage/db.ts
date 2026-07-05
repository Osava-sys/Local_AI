import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

export function initDb(dbPath: string, migrationsDir: string): Database.Database {
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db, migrationsDir)

  return db
}
