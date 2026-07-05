import type BetterSqlite3 from 'better-sqlite3'
import type { Message } from '@shared/types/chat.types'

export class MessagesRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  listByChatId(chatId: string): Message[] {
    return this.db
      .prepare(`
        SELECT id, chat_id as chatId, role, content, model, created_at as createdAt
        FROM messages WHERE chat_id = ? ORDER BY created_at ASC
      `)
      .all(chatId) as Message[]
  }

  create(id: string, chatId: string, role: string, content: string, model: string | null): Message {
    this.db
      .prepare('INSERT INTO messages (id, chat_id, role, content, model) VALUES (?, ?, ?, ?, ?)')
      .run(id, chatId, role, content, model)
    // touch parent chat updated_at
    this.db
      .prepare(`UPDATE chats SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
      .run(chatId)
    return this.db
      .prepare(`SELECT id, chat_id as chatId, role, content, model, created_at as createdAt FROM messages WHERE id = ?`)
      .get(id) as Message
  }
}
