import type { ApprovalEvaluation } from '@shared/types/approval.types'
import type { ToolIntent } from '@shared/types/sandbox.types'
import { approvalPolicy, type ApprovalPolicy } from '../approvals/approval-policy'

export class ApprovalGate {
  constructor(private readonly policy: ApprovalPolicy = approvalPolicy) {}

  evaluate(intent: ToolIntent): ApprovalEvaluation {
    return this.policy.evaluate(intent)
  }
}
