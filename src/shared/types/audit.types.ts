import type { ToolIntentKind, ToolResultStatus } from './sandbox.types'
import type { ApprovalDecision } from './approval.types'

/**
 * One row of the sandbox audit trail. Every intent that reaches the
 * SandboxExecutor produces exactly one record, regardless of outcome.
 * The `summary` is a truncated, secret-free description of the action.
 */
export interface SandboxAuditRecord {
  id?: number
  runId?: string | null
  toolCallId?: string | null
  intentKind: ToolIntentKind
  summary: string
  policyDecision: ApprovalDecision
  status: ToolResultStatus
  durationMs: number
  createdAt?: string
}
