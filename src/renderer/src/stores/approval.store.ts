import { create } from 'zustand'
import type { ApprovalRequestView } from '@shared/types/approval.types'

const MAX_RECENT = 20

interface ApprovalStoreState {
  pending: ApprovalRequestView[]
  /** Recently decided requests (approved/rejected/expired), newest first. */
  recent: ApprovalRequestView[]
  /** Replace the whole pending queue (used after an initial approval:list fetch). */
  setPending(items: ApprovalRequestView[]): void
  /** Insert or update a request (used on approval:requested). */
  upsert(request: ApprovalRequestView): void
  /** Move a decided request out of pending and into recent (used on approval:resolved). */
  resolve(request: ApprovalRequestView): void
  /** Optimistically drop a pending request without recording history. */
  remove(id: string): void
}

export const useApprovalStore = create<ApprovalStoreState>(set => ({
  pending: [],
  recent: [],
  setPending: items => set({ pending: items.filter(item => item.status === 'pending') }),
  upsert: request =>
    set(state => {
      const others = state.pending.filter(item => item.id !== request.id)
      return { pending: request.status === 'pending' ? [...others, request] : others }
    }),
  resolve: request =>
    set(state => ({
      pending: state.pending.filter(item => item.id !== request.id),
      recent: [request, ...state.recent.filter(item => item.id !== request.id)].slice(0, MAX_RECENT),
    })),
  remove: id => set(state => ({ pending: state.pending.filter(item => item.id !== id) })),
}))
