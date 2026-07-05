import type BetterSqlite3 from 'better-sqlite3'
import type { AgentState } from '@shared/types/agent.types'

export interface AgentRunRecord {
  id: string
  chatId: string | null
  state: AgentState
  model: string | null
  createdAt: string
  updatedAt: string
}

export class AgentRunsRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(id: string, model: string | null, chatId: string | null = null): AgentRunRecord {
    this.db
      .prepare('INSERT INTO agent_runs (id, chat_id, state, model) VALUES (?, ?, ?, ?)')
      .run(id, chatId, 'running', model)
    return this.findById(id)!
  }

  findById(id: string): AgentRunRecord | null {
    return (this.db
      .prepare(`
        SELECT id, chat_id as chatId, state, model, created_at as createdAt, updated_at as updatedAt
        FROM agent_runs WHERE id = ?
      `)
      .get(id) as AgentRunRecord | undefined) ?? null
  }

  updateState(id: string, state: AgentState): void {
    this.db
      .prepare(`
        UPDATE agent_runs
        SET state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `)
      .run(state, id)
  }
}
