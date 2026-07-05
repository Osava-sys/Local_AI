import { useCallback, useEffect } from 'react'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import { useApprovalStore } from '../stores/approval.store'

export interface UseApproval {
  pending: ApprovalRequestView[]
  recent: ApprovalRequestView[]
  approve(id: string, note?: string): Promise<void>
  reject(id: string, note?: string): Promise<void>
  refresh(): Promise<void>
}

/**
 * Subscribes the approval store to the main process: it seeds the queue from
 * approval:list and keeps it live via approval:requested / approval:resolved.
 * Resolved requests are kept in a recent-decisions history instead of vanishing.
 */
export function useApproval(): UseApproval {
  const pending = useApprovalStore(state => state.pending)
  const recent = useApprovalStore(state => state.recent)
  const setPending = useApprovalStore(state => state.setPending)
  const upsert = useApprovalStore(state => state.upsert)
  const resolve = useApprovalStore(state => state.resolve)
  const remove = useApprovalStore(state => state.remove)

  const refresh = useCallback(async () => {
    const result = await window.api.approval.list()
    if (result.ok) setPending(result.value)
  }, [setPending])

  useEffect(() => {
    void refresh()
    const offRequested = window.api.approval.on('requested', request => upsert(request))
    const offResolved = window.api.approval.on('resolved', request => resolve(request))
    return () => {
      offRequested()
      offResolved()
    }
  }, [refresh, upsert, resolve])

  const approve = useCallback(
    async (id: string, note?: string) => {
      const result = await window.api.approval.approve(id, note)
      if (result.ok) result.value ? resolve(result.value) : remove(id)
    },
    [resolve, remove],
  )

  const reject = useCallback(
    async (id: string, note?: string) => {
      const result = await window.api.approval.reject(id, note)
      if (result.ok) result.value ? resolve(result.value) : remove(id)
    },
    [resolve, remove],
  )

  return { pending, recent, approve, reject, refresh }
}
