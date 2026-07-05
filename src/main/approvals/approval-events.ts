import { EventEmitter } from 'events'
import type { ApprovalRequest, ApprovalRequestView } from '@shared/types/approval.types'

export type ApprovalEventName = 'requested' | 'resolved'

/** Strip the raw intent before an approval crosses the IPC boundary. */
export function toApprovalView(request: ApprovalRequest): ApprovalRequestView {
  const { intent: _intent, ...view } = request
  return view
}

/** Typed event bus for approval lifecycle notifications. */
export class ApprovalEmitter {
  private readonly emitter = new EventEmitter()

  emitRequested(request: ApprovalRequest): void {
    this.emitter.emit('requested', request)
  }

  emitResolved(request: ApprovalRequest): void {
    this.emitter.emit('resolved', request)
  }

  onRequested(listener: (request: ApprovalRequest) => void): () => void {
    this.emitter.on('requested', listener)
    return () => this.emitter.off('requested', listener)
  }

  onResolved(listener: (request: ApprovalRequest) => void): () => void {
    this.emitter.on('resolved', listener)
    return () => this.emitter.off('resolved', listener)
  }
}
