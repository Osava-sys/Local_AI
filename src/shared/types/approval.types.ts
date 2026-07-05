import type { ToolIntent } from './sandbox.types'

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
