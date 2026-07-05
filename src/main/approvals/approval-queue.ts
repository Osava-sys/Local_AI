import type { ApprovalRequest } from '@shared/types/approval.types'

export type ApprovalOutcome = 'approved' | 'rejected' | 'expired'

interface PendingEntry {
  request: ApprovalRequest
  settle: (outcome: ApprovalOutcome) => void
}

/**
 * In-memory registry of approval requests. Each enqueued request returns a
 * promise that settles when a human (or a timeout) resolves it. Resolved
 * requests are retained so their final state can still be looked up.
 */
export class ApprovalQueue {
  private readonly entries = new Map<string, PendingEntry>()

  enqueue(request: ApprovalRequest): Promise<ApprovalOutcome> {
    return new Promise<ApprovalOutcome>(resolve => {
      this.entries.set(request.id, { request, settle: resolve })
    })
  }

  /** Only requests still awaiting a decision. */
  list(): ApprovalRequest[] {
    return Array.from(this.entries.values())
      .map(entry => entry.request)
      .filter(request => request.status === 'pending')
  }

  get(id: string): ApprovalRequest | undefined {
    return this.entries.get(id)?.request
  }

  /** Settles a pending request, returning it; undefined if unknown or already decided. */
  settle(id: string, outcome: ApprovalOutcome, note?: string): ApprovalRequest | undefined {
    const entry = this.entries.get(id)
    if (!entry || entry.request.status !== 'pending') return undefined

    entry.request.status = outcome
    entry.request.decidedAt = new Date().toISOString()
    if (note) entry.request.note = note
    entry.settle(outcome)
    return entry.request
  }

  pendingCount(): number {
    return this.list().length
  }

  /** Expires every still-pending request (e.g. on shutdown). */
  drain(): void {
    for (const entry of this.entries.values()) {
      if (entry.request.status === 'pending') {
        entry.request.status = 'expired'
        entry.request.decidedAt = new Date().toISOString()
        entry.settle('expired')
      }
    }
  }
}
