import React from 'react'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import { useApproval } from '../../hooks/use-approval'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ApprovalDialog } from './ApprovalDialog'

const DECISION_LABEL: Record<string, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
}

function RecentDecision({ request }: { request: ApprovalRequestView }): React.ReactElement {
  const tone = request.status === 'approved' ? 'success' : request.status === 'expired' ? 'warning' : 'danger'
  return (
    <div className="approval-row">
      <div className="toolbar-line">
        <Badge tone={tone}>{DECISION_LABEL[request.status] ?? request.status}</Badge>
        <span className="muted mono">{request.decidedAt ?? request.createdAt}</span>
      </div>
      <strong>{request.intentKind}</strong>
      <span className="muted">{request.summary}</span>
    </div>
  )
}

/** Live queue of pending human-approval requests plus recent decisions. */
export function ApprovalQueue(): React.ReactElement {
  const { pending, recent, approve, reject, refresh } = useApproval()

  return (
    <div>
      <div className="panel-header">
        <div className="panel-title">Human Approvals</div>
        <div className="header-cluster">
          <Badge tone={pending.length ? 'warning' : 'success'}>{pending.length} pending</Badge>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            Sync
          </Button>
        </div>
      </div>

      <div className="panel-body">
        {pending.length === 0 ? (
          <div className="empty-state">
            <strong>No actions awaiting approval</strong>
            <span>Safe actions can continue without a human decision.</span>
          </div>
        ) : (
          <div className="approval-stack">
            {pending.map(request => (
              <ApprovalDialog key={request.id} request={request} onApprove={approve} onReject={reject} />
            ))}
          </div>
        )}

        {recent.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="panel-title" style={{ marginBottom: 10 }}>Recent decisions</div>
            {recent.map(request => (
              <RecentDecision key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
