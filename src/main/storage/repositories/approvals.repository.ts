import type BetterSqlite3 from 'better-sqlite3'

export interface ApprovalRow {
  id: string
  run_id: string
  tool_call: string
  status: 'pending' | 'approved' | 'rejected'
  decided_at: string | null
  created_at: string
}

export interface ApprovalInsert {
  id: string
  runId: string
  /** Serialised, secret-free description of the tool call awaiting approval. */
  toolCall: string
}

/**
 * Persists human-in-the-loop approval decisions tied to an agent run.
 * The live queue lives in memory; this table is the durable audit of outcomes.
 */
export class ApprovalsRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  create(entry: ApprovalInsert): void {
    this.db
      .prepare('INSERT INTO approvals (id, run_id, tool_call) VALUES (?, ?, ?)')
      .run(entry.id, entry.runId, entry.toolCall)
  }

  resolve(id: string, status: 'approved' | 'rejected'): void {
    this.db
      .prepare(
        `UPDATE approvals
           SET status = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .run(status, id)
  }

  listByRun(runId: string): ApprovalRow[] {
    return this.db
      .prepare('SELECT * FROM approvals WHERE run_id = ? ORDER BY created_at DESC')
      .all(runId) as ApprovalRow[]
  }

  pending(): ApprovalRow[] {
    return this.db
      .prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC")
      .all() as ApprovalRow[]
  }
}
