import { loadLimits } from '../sandbox/limits'
import { ApprovalEmitter } from './approval-events'
import { ApprovalQueue } from './approval-queue'
import { ApprovalService } from './approval-service'
import { ApprovalTimeouts } from './approval-timeouts'

let service: ApprovalService | null = null
let timeouts: ApprovalTimeouts | null = null

function approvalTtlMs(): number {
  return loadLimits().approvalTimeoutMs
}

/** Process-wide approval service shared by the agent coordinator and IPC handlers. */
export function getApprovalService(): ApprovalService {
  if (!service) {
    service = new ApprovalService(new ApprovalQueue(), new ApprovalEmitter(), undefined, approvalTtlMs())
  }
  return service
}

export function getApprovalTimeouts(): ApprovalTimeouts {
  if (!timeouts) timeouts = new ApprovalTimeouts(getApprovalService(), approvalTtlMs())
  return timeouts
}
