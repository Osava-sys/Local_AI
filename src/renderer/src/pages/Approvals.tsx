import React from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import { useApproval } from '../hooks/use-approval'
import { ApprovalDialog } from '../components/agent/ApprovalDialog'

const DECISION_LABEL: Record<string, string> = {
  approved: 'approved',
  rejected: 'rejected',
  expired: 'expired',
}

function decisionTone(status: string): string {
  if (status === 'approved') return 'success'
  if (status === 'expired') return 'warning'
  return 'danger'
}

function extractTarget(summary: string): string | null {
  const match = summary.match(
    /(\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b|https?:\/\/\S+|(?:\/[\w.-]+){2,})/,
  )
  return match ? match[0] : null
}

function formatTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function DecisionRow({ request }: { request: ApprovalRequestView }): React.ReactElement {
  const tone = decisionTone(request.status)
  const target = extractTarget(request.summary)
  return (
    <div className="decision-row">
      <span className="decision-row__dot" data-tone={tone} />
      <div className="decision-row__body">
        <strong>{request.intentKind}</strong>
        <span>{target ?? request.summary}</span>
      </div>
      <div className="decision-row__status" data-tone={tone}>
        <b>{DECISION_LABEL[request.status] ?? request.status}</b>
        <time>{formatTime(request.decidedAt ?? request.createdAt)}</time>
      </div>
    </div>
  )
}

/** Human-in-the-loop approval queue with a live decision history sidebar. */
export default function Approvals(): React.ReactElement {
  const { pending, recent, approve, reject } = useApproval()

  return (
    <div className="page">
      <div className="page-head">
        <h1>Approvals</h1>
        <p>File d’attente des actions sensibles · l’agent ne peut exécuter qu’après votre décision.</p>
      </div>

      <div className="approvals-layout">
        <div className="approvals-queue">
          {pending.length === 0 ? (
            <div className="panel">
              <div className="empty-state">
                <ClipboardCheck size={26} />
                <strong>Aucune action en attente</strong>
                <span className="muted">Les actions sûres se poursuivent sans décision humaine.</span>
              </div>
            </div>
          ) : (
            pending.map(request => (
              <ApprovalDialog key={request.id} request={request} onApprove={approve} onReject={reject} />
            ))
          )}
        </div>

        <aside className="decision-history">
          <h3>Historique des décisions</h3>
          {recent.length === 0 ? (
            <div className="decision-row">
              <span className="decision-row__dot" />
              <div className="decision-row__body">
                <span className="muted">Aucune décision enregistrée.</span>
              </div>
            </div>
          ) : (
            recent.map(request => <DecisionRow key={request.id} request={request} />)
          )}
        </aside>
      </div>
    </div>
  )
}
