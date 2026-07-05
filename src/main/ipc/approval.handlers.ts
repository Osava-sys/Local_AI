import { BrowserWindow } from 'electron'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import type { Result } from '@shared/types/ipc.types'
import { getApprovalService } from '../approvals/approval-container'

function readDecisionPayload(payload: unknown): { id: string; note?: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as Record<string, unknown>
  const id = record['id']
  if (typeof id !== 'string' || id.length === 0) return null
  const note = typeof record['note'] === 'string' ? (record['note'] as string) : undefined
  return { id, note }
}

export function handleApprovalList(): Result<ApprovalRequestView[]> {
  return { ok: true, value: getApprovalService().list() }
}

export function handleApprovalApprove(_event: unknown, payload: unknown): Result<ApprovalRequestView | null> {
  const parsed = readDecisionPayload(payload)
  if (!parsed) return { ok: false, error: 'Missing approval id' }
  return { ok: true, value: getApprovalService().approve(parsed.id, parsed.note) ?? null }
}

export function handleApprovalReject(_event: unknown, payload: unknown): Result<ApprovalRequestView | null> {
  const parsed = readDecisionPayload(payload)
  if (!parsed) return { ok: false, error: 'Missing approval id' }
  return { ok: true, value: getApprovalService().reject(parsed.id, parsed.note) ?? null }
}

let forwardingWired = false

/** Subscribes once and rebroadcasts approval lifecycle events to every window. */
export function registerApprovalEventForwarding(): void {
  if (forwardingWired) return
  forwardingWired = true
  const service = getApprovalService()
  service.onRequested(view => broadcast('approval:requested', view))
  service.onResolved(view => broadcast('approval:resolved', view))
}

function broadcast(channel: string, payload: ApprovalRequestView): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
