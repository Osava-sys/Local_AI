import type { ToolIntent, ToolIntentKind } from './sandbox.types'

export type ApprovalDecision = 'allow' | 'needs_human_approval' | 'deny'

export interface ApprovalRule {
  id: string
  description: string
  match: string
  decision: ApprovalDecision
  reason: string
}

export interface ApprovalPolicyConfig {
  defaultDecision: ApprovalDecision
  criticalPatterns: string[]
  deniedPatterns: string[]
  localTargets: string[]
  highRiskTools: string[]
}

export interface ApprovalEvaluation {
  decision: ApprovalDecision
  reason: string
  matchedRule?: string
  intent: ToolIntent
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

/** A human-in-the-loop approval request queued for a high-risk intent. */
export interface ApprovalRequest {
  id: string
  runId?: string
  toolCallId?: string
  intentKind: ToolIntentKind
  /** Truncated, secret-free description of what will run. */
  summary: string
  reason: string
  risk?: 'low' | 'medium' | 'high' | 'critical'
  status: ApprovalStatus
  createdAt: string
  /** ISO time at which a still-pending request auto-expires. */
  expiresAt?: string
  decidedAt?: string
  note?: string
  /** The full intent, retained so an approved request can be executed. */
  intent: ToolIntent
}

/** Serializable view sent to the renderer (omits the raw intent internals it does not need). */
export interface ApprovalRequestView {
  id: string
  runId?: string
  toolCallId?: string
  intentKind: ToolIntentKind
  summary: string
  reason: string
  risk?: 'low' | 'medium' | 'high' | 'critical'
  status: ApprovalStatus
  createdAt: string
  expiresAt?: string
  decidedAt?: string
  note?: string
}

export interface ApprovalDecisionInput {
  id: string
  note?: string
}
