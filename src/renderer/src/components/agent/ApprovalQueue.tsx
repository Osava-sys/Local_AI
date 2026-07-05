import React from 'react'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import { useApproval } from '../../hooks/use-approval'
import { ApprovalDialog } from './ApprovalDialog'

const DECISION_STYLE: Record<string, { color: string; label: string }> = {
  approved: { color: '#2e7d32', label: 'Approved — action executed' },
  rejected: { color: '#c62828', label: 'Rejected — action was not executed' },
  expired: { color: '#ef6c00', label: 'Expired without decision — action was not executed' },
}

function RecentDecision({ request }: { request: ApprovalRequestView }): React.ReactElement {
  const style = DECISION_STYLE[request.status] ?? { color: '#555', label: request.status }
  return (
    <li style={{ marginBottom: 6, fontSize: '0.85em' }}>
      <span style={{ color: style.color, fontWeight: 600 }}>{style.label}</span>
      {' — '}
      <span style={{ color: '#444' }}>{request.intentKind}: {request.summary}</span>
    </li>
  )
}

/** Live queue of pending human-approval requests plus recent decisions. */
export function ApprovalQueue(): React.ReactElement {
  const { pending, recent, approve, reject } = useApproval()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Approvals</h2>
        <span
          style={{
            background: pending.length ? '#c62828' : '#9e9e9e',
            color: '#fff',
            borderRadius: 12,
            padding: '2px 10px',
            fontSize: '0.8em',
          }}
        >
          {pending.length} pending
        </span>
      </div>

      {pending.length === 0 ? (
        <p style={{ color: '#777' }}>No actions awaiting approval.</p>
      ) : (
        <div style={{ marginTop: 12 }}>
          {pending.map(request => (
            <ApprovalDialog key={request.id} request={request} onApprove={approve} onReject={reject} />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 8px' }}>Recent approval decisions</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.map(request => (
              <RecentDecision key={request.id} request={request} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
