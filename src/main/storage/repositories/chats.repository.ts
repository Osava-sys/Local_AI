import type BetterSqlite3 from 'better-sqlite3'
import type { Chat } from '@shared/types/chat.types'

export class ChatsRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  list(): Chat[] {
    return this.db
      .prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM chats ORDER BY updated_at DESC')
      .all() as Chat[]
  }

  findById(id: string): Chat | null {
    return (this.db
      .prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM chats WHERE id = ?')
      .get(id) as Chat | undefined) ?? null
  }

  create(id: string, title: string): Chat {
    this.db
      .prepare('INSERT INTO chats (id, title) VALUES (?, ?)')
      .run(id, title)
    return this.findById(id)!
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(id)
  }
}
