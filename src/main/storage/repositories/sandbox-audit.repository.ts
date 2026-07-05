import type BetterSqlite3 from 'better-sqlite3'
import type { SandboxAuditRecord } from '@shared/types/audit.types'

interface SandboxAuditRow {
  id: number
  run_id: string | null
  tool_call_id: string | null
  intent_kind: string
  summary: string
  policy_decision: string
  status: string
  duration_ms: number
  created_at: string
}

/** Append-only access to sandbox_audit_log. Never issues UPDATE or DELETE. */
export class SandboxAuditRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  append(entry: SandboxAuditRecord): void {
    this.db
      .prepare(
        `INSERT INTO sandbox_audit_log
           (run_id, tool_call_id, intent_kind, summary, policy_decision, status, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.runId ?? null,
        entry.toolCallId ?? null,
        entry.intentKind,
        entry.summary,
        entry.policyDecision,
        entry.status,
        Math.max(0, Math.round(entry.durationMs)),
      )
  }

  recent(limit = 100): SandboxAuditRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sandbox_audit_log ORDER BY id DESC LIMIT ?')
      .all(limit) as SandboxAuditRow[]
    return rows.map(mapRow)
  }
}

function mapRow(row: SandboxAuditRow): SandboxAuditRecord {
  return {
    id: row.id,
    runId: row.run_id,
    toolCallId: row.tool_call_id,
    intentKind: row.intent_kind as SandboxAuditRecord['intentKind'],
    summary: row.summary,
    policyDecision: row.policy_decision as SandboxAuditRecord['policyDecision'],
    status: row.status as SandboxAuditRecord['status'],
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  }
}
