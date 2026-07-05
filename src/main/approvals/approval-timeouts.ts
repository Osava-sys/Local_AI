import type { ApprovalService } from './approval-service'

/**
 * Auto-expires pending approval requests so a run cannot block forever waiting
 * on a human. Timers are unref'd so they never keep the process alive.
 */
export class ApprovalTimeouts {
  private readonly timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly service: ApprovalService,
    private readonly ttlMs = 5 * 60_000,
  ) {}

  arm(id: string): void {
    this.clear(id)
    const timer = setTimeout(() => {
      this.timers.delete(id)
      this.service.expire(id)
    }, this.ttlMs)
    if (typeof timer.unref === 'function') timer.unref()
    this.timers.set(id, timer)
  }

  clear(id: string): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
  }

  clearAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
