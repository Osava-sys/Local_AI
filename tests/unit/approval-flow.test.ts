import { describe, it, expect, vi } from 'vitest'
import type { ShellToolIntent, ToolIntent, ToolResult } from '@shared/types/sandbox.types'
import { ApprovalQueue } from '../../src/main/approvals/approval-queue'
import { ApprovalEmitter } from '../../src/main/approvals/approval-events'
import { ApprovalService } from '../../src/main/approvals/approval-service'
import { ApprovalTimeouts } from '../../src/main/approvals/approval-timeouts'
import { ApprovalCoordinator, type ApprovalCapableExecutor } from '../../src/main/approvals/approval-coordinator'

const intent: ShellToolIntent = { id: 'i1', kind: 'shell', command: 'rm', args: ['-rf', '/tmp/x'] }

function result(status: ToolResult['status'], extra: Partial<ToolResult> = {}): ToolResult {
  return {
    id: intent.id,
    kind: 'shell',
    status,
    observation: status,
    startedAt: 'a',
    endedAt: 'b',
    durationMs: 1,
    ...extra,
  }
}

describe('ApprovalQueue', () => {
  it('settles the decision promise when a request is approved', async () => {
    const queue = new ApprovalQueue()
    const request = { id: 'r1', intentKind: 'shell' as const, summary: 's', reason: 'why', status: 'pending' as const, createdAt: 'now', intent }
    const decision = queue.enqueue(request)

    expect(queue.pendingCount()).toBe(1)
    queue.settle('r1', 'approved')

    await expect(decision).resolves.toBe('approved')
    expect(queue.pendingCount()).toBe(0)
  })

  it('ignores a second settle on an already-decided request', () => {
    const queue = new ApprovalQueue()
    queue.enqueue({ id: 'r2', intentKind: 'shell', summary: 's', reason: '', status: 'pending', createdAt: 'now', intent })
    expect(queue.settle('r2', 'approved')).toBeDefined()
    expect(queue.settle('r2', 'rejected')).toBeUndefined()
  })
})

describe('ApprovalService', () => {
  it('emits requested then resolved around a human decision', () => {
    const service = new ApprovalService()
    const requested = vi.fn()
    const resolved = vi.fn()
    service.onRequested(requested)
    service.onResolved(resolved)

    const { request } = service.request({ intent, reason: 'needs approval' })
    expect(requested).toHaveBeenCalledOnce()
    expect(service.list()).toHaveLength(1)

    service.approve(request.id, 'ok by me')
    expect(resolved).toHaveBeenCalledOnce()
    expect(service.list()).toHaveLength(0)
  })

  it('stamps expiresAt from the configured ttl and auto-expires via the timeout guard', async () => {
    vi.useFakeTimers()
    try {
      const service = new ApprovalService(new ApprovalQueue(), new ApprovalEmitter(), undefined, 1000)
      const { request, decision } = service.request({ intent, reason: 'r' })

      expect(request.expiresAt).toBeDefined()
      const ttl = new Date(request.expiresAt as string).getTime() - new Date(request.createdAt).getTime()
      expect(ttl).toBe(1000)

      const timeouts = new ApprovalTimeouts(service, 1000)
      timeouts.arm(request.id)
      vi.advanceTimersByTime(1000)

      await expect(decision).resolves.toBe('expired')
      expect(service.list()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ApprovalCoordinator', () => {
  function fakeExecutor(): ApprovalCapableExecutor & { forced: boolean } {
    return {
      forced: false,
      execute: vi.fn(async (i: ToolIntent) => result('requires_approval', { needsApproval: true, approvalReason: 'critical' , id: i.id })),
      forceExecute: vi.fn(async function (this: { forced: boolean }) {
        return result('success')
      }),
    } as unknown as ApprovalCapableExecutor & { forced: boolean }
  }

  it('executes the intent only after a human approves', async () => {
    const executor = fakeExecutor()
    const service = new ApprovalService()
    const coordinator = new ApprovalCoordinator(executor, service)

    const seenId = new Promise<string>(resolve => service.onRequested(view => resolve(view.id)))
    const pending = coordinator.execute(intent)

    service.approve(await seenId)
    const outcome = await pending

    expect(outcome.status).toBe('success')
    expect(executor.forceExecute).toHaveBeenCalledOnce()
  })

  it('denies (and never executes) when a human rejects', async () => {
    const executor = fakeExecutor()
    const service = new ApprovalService()
    const coordinator = new ApprovalCoordinator(executor, service)

    const seenId = new Promise<string>(resolve => service.onRequested(view => resolve(view.id)))
    const pending = coordinator.execute(intent)

    service.reject(await seenId, 'too dangerous')
    const outcome = await pending

    expect(outcome.status).toBe('denied')
    expect(executor.forceExecute).not.toHaveBeenCalled()
  })
})
