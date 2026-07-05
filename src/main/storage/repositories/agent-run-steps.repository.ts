import type BetterSqlite3 from 'better-sqlite3'
import type { AgentRunStep, ReasoningStep } from '@shared/types/agent.types'

function dbStepType(type: ReasoningStep['type']): 'thought' | 'action' | 'observation' {
  if (type === 'reason') return 'thought'
  if (type === 'act') return 'action'
  return 'observation'
}

export class AgentRunStepsRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  append(runId: string, step: ReasoningStep): AgentRunStep {
    const id = crypto.randomUUID()
    this.db
      .prepare(`
        INSERT INTO agent_run_steps (id, run_id, type, content, tool_call)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        id,
        runId,
        dbStepType(step.type),
        step.content,
        step.toolCall ? JSON.stringify(step.toolCall) : null,
      )

    return this.findById(id)!
  }

  listByRunId(runId: string): AgentRunStep[] {
    const rows = this.db
      .prepare(`
        SELECT id, run_id as runId, type, content, tool_call as toolCall, created_at as createdAt
        FROM agent_run_steps
        WHERE run_id = ?
        ORDER BY created_at ASC
      `)
      .all(runId) as Array<AgentRunStep & { toolCall: string | null }>

    return rows.map(row => ({
      ...row,
      toolCall: row.toolCall ? JSON.parse(row.toolCall) : undefined,
      timestamp: row.createdAt ? Date.parse(row.createdAt) : Date.now(),
    }))
  }

  private findById(id: string): AgentRunStep | null {
    const row = this.db
      .prepare(`
        SELECT id, run_id as runId, type, content, tool_call as toolCall, created_at as createdAt
        FROM agent_run_steps WHERE id = ?
      `)
      .get(id) as (AgentRunStep & { toolCall: string | null }) | undefined

    if (!row) return null
    return {
      ...row,
      toolCall: row.toolCall ? JSON.parse(row.toolCall) : undefined,
      timestamp: row.createdAt ? Date.parse(row.createdAt) : Date.now(),
    }
  }
}
