import { randomUUID } from 'crypto'
import type { ApprovalRequest, ApprovalRequestView } from '@shared/types/approval.types'
import type { ToolIntent } from '@shared/types/sandbox.types'
import { summarizeIntent } from '../sandbox/audit'
import { ApprovalEmitter, toApprovalView } from './approval-events'
import { ApprovalQueue, type ApprovalOutcome } from './approval-queue'

export interface ApprovalRequestInput {
  intent: ToolIntent
  reason: string
  runId?: string
  toolCallId?: string
}

/** Durable store for approval outcomes (satisfied by ApprovalsRepository). */
export interface ApprovalPersistence {
  create(entry: { id: string; runId: string; toolCall: string }): void
  resolve(id: string, status: 'approved' | 'rejected'): void
}

/**
 * Coordinates the human-in-the-loop approval lifecycle: it creates requests,
 * exposes the pending queue to the UI, applies decisions, emits events, and
 * (when a run id is present) persists the outcome. It never auto-approves.
 */
export class ApprovalService {
  constructor(
    private readonly queue: ApprovalQueue = new ApprovalQueue(),
    private readonly events: ApprovalEmitter = new ApprovalEmitter(),
    private readonly persistence?: ApprovalPersistence,
    /** TTL used to stamp `expiresAt`; keep in sync with ApprovalTimeouts. */
    private readonly ttlMs?: number,
  ) {}

  request(input: ApprovalRequestInput): { request: ApprovalRequest; decision: Promise<ApprovalOutcome> } {
    const now = Date.now()
    const request: ApprovalRequest = {
      id: randomUUID(),
      runId: input.runId,
      toolCallId: input.toolCallId ?? input.intent.id,
      intentKind: input.intent.kind,
      summary: summarizeIntent(input.intent),
      reason: input.reason,
      risk: input.intent.risk,
      status: 'pending',
      createdAt: new Date(now).toISOString(),
      expiresAt: this.ttlMs ? new Date(now + this.ttlMs).toISOString() : undefined,
      intent: input.intent,
    }

    const decision = this.queue.enqueue(request)
    if (this.persistence && input.runId) {
      try {
        this.persistence.create({ id: request.id, runId: input.runId, toolCall: request.summary })
      } catch {
        // Persistence is best-effort; the in-memory queue remains authoritative.
      }
    }
    this.events.emitRequested(request)
    return { request, decision }
  }

  list(): ApprovalRequestView[] {
    return this.queue.list().map(toApprovalView)
  }

  approve(id: string, note?: string): ApprovalRequestView | undefined {
    return this.settle(id, 'approved', note)
  }

  reject(id: string, note?: string): ApprovalRequestView | undefined {
    return this.settle(id, 'rejected', note)
  }

  /** Marks a request expired (used by the timeout guard). */
  expire(id: string): ApprovalRequestView | undefined {
    return this.settle(id, 'expired')
  }

  onRequested(callback: (view: ApprovalRequestView) => void): () => void {
    return this.events.onRequested(request => callback(toApprovalView(request)))
  }

  onResolved(callback: (view: ApprovalRequestView) => void): () => void {
    return this.events.onResolved(request => callback(toApprovalView(request)))
  }

  private settle(id: string, outcome: ApprovalOutcome, note?: string): ApprovalRequestView | undefined {
    const request = this.queue.settle(id, outcome, note)
    if (!request) return undefined

    if (this.persistence && request.runId && (outcome === 'approved' || outcome === 'rejected')) {
      try {
        this.persistence.resolve(id, outcome)
      } catch {
        // Ignore storage failures; the outcome is already reflected in memory.
      }
    }
    this.events.emitResolved(request)
    return toApprovalView(request)
  }
}
