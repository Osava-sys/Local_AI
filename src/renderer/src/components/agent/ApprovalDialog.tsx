import React, { useEffect, useState } from 'react'
import { Check, Clock, ShieldAlert, X } from 'lucide-react'
import type { ApprovalRequestView } from '@shared/types/approval.types'
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

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Best-effort target extraction (IP / CIDR / URL / path) from the secret-free summary. */
function extractTarget(summary: string): string | null {
  const match = summary.match(
    /(\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b|https?:\/\/\S+|(?:\/[\w.-]+){2,})/,
  )
  return match ? match[0] : null
}

/** A single pending approval card: intent, target, command, countdown and decision actions. */
export function ApprovalDialog({ request, onApprove, onReject }: ApprovalDialogProps): React.ReactElement {
  const remaining = useCountdown(request.expiresAt)
  const risk = request.risk ?? 'high'
  const target = extractTarget(request.summary)

  return (
    <article className="approval-card" data-risk={risk}>
      <div className="approval-card__top">
        <span className="approval-card__shield">
          <ShieldAlert size={17} />
        </span>
        <div className="approval-card__ident">
          <strong>{request.intentKind}</strong>
          <div className="meta">
            {request.runId && <b>{request.runId}</b>}
            {target && (
              <>
                {' · cible '}
                <b>{target}</b>
              </>
            )}
          </div>
        </div>
        <span className="risk-chip" data-risk={risk}>
          {risk}
        </span>
      </div>

      {request.reason && <p className="approval-card__desc">{request.reason}</p>}

      <div className="approval-card__cmd">{request.summary}</div>

      <div className="approval-card__foot">
        <span className={['approval-timer', remaining !== null && remaining <= 60 ? 'is-urgent' : ''].filter(Boolean).join(' ')}>
          <Clock size={14} />
          {remaining !== null ? (
            <>
              expire dans <b>{formatClock(remaining)}</b>
            </>
          ) : (
            'sans échéance'
          )}
        </span>
        <div className="approval-actions">
          <Button variant="subtle" onClick={() => onReject(request.id)}>
            <X size={15} />
            Rejeter
          </Button>
          <Button variant="success" onClick={() => onApprove(request.id)}>
            <Check size={15} />
            Approuver
          </Button>
        </div>
      </div>
    </article>
  )
}
