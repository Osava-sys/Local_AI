import React, { useEffect, useState } from 'react'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

interface ApprovalDialogProps {
  request: ApprovalRequestView
  onApprove(id: string): void
  onReject(id: string): void
}

/** Seconds remaining until `expiresAt`, or null when there is no deadline. */
function useCountdown(expiresAt?: string): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => computeRemaining(expiresAt))
  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null)
      return
    }
    setRemaining(computeRemaining(expiresAt))
    const timer = setInterval(() => setRemaining(computeRemaining(expiresAt)), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  return remaining
}

function computeRemaining(expiresAt?: string): number | null {
  if (!expiresAt) return null
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

/** A single pending approval card with a countdown and approve / reject actions. */
export function ApprovalDialog({ request, onApprove, onReject }: ApprovalDialogProps): React.ReactElement {
  const remaining = useCountdown(request.expiresAt)
  const risk = request.risk ?? 'high'
  const riskTone = risk === 'low' ? 'success' : risk === 'medium' ? 'warning' : risk === 'critical' ? 'critical' : 'danger'

  return (
    <article className="approval-dialog" data-risk={risk}>
      <div className="approval-dialog-header">
        <div>
          <strong>{request.intentKind}</strong>
          <div className="muted">{request.reason}</div>
        </div>
        <span className="header-cluster">
          {remaining !== null && (
            <Badge tone={remaining <= 30 ? 'danger' : 'neutral'}>
              {remaining > 0 ? `expires in ${remaining}s` : 'expiring…'}
            </Badge>
          )}
          <Badge tone={riskTone}>{risk} risk</Badge>
        </span>
      </div>

      <pre className="approval-summary">{request.summary}</pre>
      <dl className="kv-grid">
        <dt>runId</dt>
        <dd className="truncate">{request.runId ?? 'none'}</dd>
        <dt>toolCall</dt>
        <dd className="truncate">{request.toolCallId ?? 'none'}</dd>
        <dt>created</dt>
        <dd className="truncate">{request.createdAt}</dd>
      </dl>

      <div className="approval-actions">
        <Button variant="success" onClick={() => onApprove(request.id)}>
          Approve
        </Button>
        <Button variant="danger" onClick={() => onReject(request.id)}>
          Reject
        </Button>
      </div>
    </article>
  )
}
