import Database from 'better-sqlite3'
import { join, resolve } from 'path'
import { runMigrations } from '../src/main/storage/migrations'

const dbPath = process.argv[2] ?? join(process.env['APPDATA'] ?? '.', 'local-ai', 'local-ai.db')
const migrationsDir = resolve('src', 'main', 'storage', 'migrations')

console.log(`[migrate] db:         ${dbPath}`)
console.log(`[migrate] migrations: ${migrationsDir}`)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
runMigrations(db, migrationsDir)
db.close()
console.log('[migrate] done')
