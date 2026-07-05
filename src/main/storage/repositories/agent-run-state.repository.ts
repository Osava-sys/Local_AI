import type BetterSqlite3 from 'better-sqlite3'

export class AgentRunStateRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  save(runId: string, snapshot: unknown): void {
    this.db
      .prepare(`
        INSERT INTO agent_run_state (run_id, snapshot, updated_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(run_id) DO UPDATE SET
          snapshot = excluded.snapshot,
          updated_at = excluded.updated_at
      `)
      .run(runId, JSON.stringify(snapshot))
  }

  get<T = unknown>(runId: string): T | null {
    const row = this.db
      .prepare('SELECT snapshot FROM agent_run_state WHERE run_id = ?')
      .get(runId) as { snapshot: string } | undefined
    return row ? JSON.parse(row.snapshot) as T : null
  }
}
