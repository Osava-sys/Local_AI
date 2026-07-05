import type BetterSqlite3 from 'better-sqlite3'

export type AgentSessionFactKind = 'target' | 'port' | 'user' | 'vulnerability' | 'process' | 'url' | 'note'

export interface AgentSessionFact {
  id?: string
  runId: string
  kind: AgentSessionFactKind
  key: string
  value: string
  target?: string
  port?: number
  protocol?: string
  source?: string
  createdAt?: string
}

interface AgentSessionFactRow {
  id: string
  run_id: string
  kind: AgentSessionFactKind
  key: string
  value: string
  target: string | null
  port: number | null
  protocol: string | null
  source: string | null
  created_at: string
}

export class AgentSessionMemoryRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  append(fact: AgentSessionFact): void {
    this.db
      .prepare(
        `INSERT INTO agent_session_facts
          (id, run_id, kind, key, value, target, port, protocol, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        fact.id ?? crypto.randomUUID(),
        fact.runId,
        fact.kind,
        fact.key,
        fact.value,
        fact.target ?? null,
        fact.port ?? null,
        fact.protocol ?? null,
        fact.source ?? null,
      )
  }

  search(runId: string, query: string, limit = 20): AgentSessionFact[] {
    const tokens = query
      .toLowerCase()
      .split(/\W+/)
      .filter(token => token.length >= 2)
      .slice(0, 8)
    const pattern = tokens.length ? `%${tokens.join('%')}%` : '%'

    const rows = this.db
      .prepare(
        `SELECT * FROM agent_session_facts
         WHERE run_id = ?
           AND lower(kind || ' ' || key || ' ' || value || ' ' || coalesce(target, '') || ' ' || coalesce(protocol, '')) LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(runId, pattern, limit) as AgentSessionFactRow[]

    return rows.map(mapRow)
  }

  recent(runId: string, limit = 20): AgentSessionFact[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_session_facts WHERE run_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(runId, limit) as AgentSessionFactRow[]
    return rows.map(mapRow)
  }
}

function mapRow(row: AgentSessionFactRow): AgentSessionFact {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    key: row.key,
    value: row.value,
    target: row.target ?? undefined,
    port: row.port ?? undefined,
    protocol: row.protocol ?? undefined,
    source: row.source ?? undefined,
    createdAt: row.created_at,
  }
}
