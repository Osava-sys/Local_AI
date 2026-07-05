import type { ToolIntent, ToolResult } from '@shared/types/sandbox.types'
import type { IntentExecutor } from '../sandbox/sandbox-executor'
import type { ApprovalService } from './approval-service'
import type { ApprovalTimeouts } from './approval-timeouts'

/** An executor that can also run an intent that a human has already approved. */
export interface ApprovalCapableExecutor extends IntentExecutor {
  forceExecute(intent: ToolIntent): Promise<ToolResult>
}

/**
 * Sits between the tool registry and the sandbox executor to enforce the
 * canonical path: the executor evaluates policy first; if it returns
 * `requires_approval`, a request is queued for a human and execution blocks
 * until a decision. Approved → the intent runs; rejected/expired → denied.
 * There is no silent auto-approval.
 */
export class ApprovalCoordinator implements IntentExecutor {
  constructor(
    private readonly executor: ApprovalCapableExecutor,
    private readonly approvals: ApprovalService,
    private readonly timeouts?: ApprovalTimeouts,
  ) {}

  async execute(intent: ToolIntent): Promise<ToolResult> {
    const result = await this.executor.execute(intent)
    if (result.status !== 'requires_approval') return result

    const { request, decision } = this.approvals.request({
      intent,
      reason: result.approvalReason ?? result.observation,
      toolCallId: intent.id,
    })
    this.timeouts?.arm(request.id)

    const outcome = await decision
    this.timeouts?.clear(request.id)

    if (outcome === 'approved') {
      return this.executor.forceExecute(intent)
    }

    const observation =
      outcome === 'expired'
        ? `Approval request ${request.id} expired without a decision; ${intent.kind} action was not executed.`
        : `A human rejected the ${intent.kind} action (request ${request.id}).`

    return {
      ...result,
      status: 'denied',
      needsApproval: false,
      approvalReason: undefined,
      observation,
      endedAt: new Date().toISOString(),
      metadata: { ...(result.metadata ?? {}), approvalOutcome: outcome },
    }
  }
}
