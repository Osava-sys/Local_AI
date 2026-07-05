import React, { useEffect, useState } from 'react'
import type { ApprovalRequestView } from '@shared/types/approval.types'

interface ApprovalDialogProps {
  request: ApprovalRequestView
  onApprove(id: string): void
  onReject(id: string): void
}

const RISK_COLORS: Record<string, string> = {
  low: '#2e7d32',
  medium: '#f9a825',
  high: '#ef6c00',
  critical: '#c62828',
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
  const riskColor = RISK_COLORS[request.risk ?? 'high'] ?? '#555'
  const remaining = useCountdown(request.expiresAt)

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderLeft: `4px solid ${riskColor}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
        background: '#fafafa',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong>{request.intentKind}</strong>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {remaining !== null && (
            <span style={{ fontSize: '0.8em', color: remaining <= 30 ? '#c62828' : '#555' }}>
              {remaining > 0 ? `expires in ${remaining}s` : 'expiring…'}
            </span>
          )}
          <span style={{ color: riskColor, fontSize: '0.8em', textTransform: 'uppercase' }}>
            {request.risk ?? 'high'} risk
          </span>
        </span>
      </div>

      <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid #eee', padding: 8, marginTop: 8 }}>
        {request.summary}
      </pre>
      <p style={{ margin: '6px 0', color: '#555', fontSize: '0.9em' }}>{request.reason}</p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onApprove(request.id)} style={{ background: '#2e7d32', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}>
          Approve
        </button>
        <button onClick={() => onReject(request.id)} style={{ background: '#c62828', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}>
          Reject
        </button>
      </div>
    </div>
  )
}
