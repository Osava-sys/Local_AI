import { History } from 'lucide-react'
import { useApproval } from '../hooks/use-approval'
import { useAgentStore } from '../stores/agent.store'
import { Badge } from '../components/ui/Badge'

export default function AuditLog(): React.ReactElement {
  const { pending, recent } = useApproval()
  const steps = useAgentStore(state => state.steps)
  const approvals = [...pending, ...recent]

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <History size={17} />
            Audit Log
          </div>
          <Badge tone={approvals.length > 0 ? 'accent' : 'neutral'}>{approvals.length + steps.length} events</Badge>
        </div>
        <div className="panel-body">
          {approvals.map(item => (
            <div className="approval-row" key={item.id}>
              <div className="toolbar-line">
                <Badge tone={item.status === 'pending' ? 'warning' : item.status === 'approved' ? 'success' : 'danger'}>
                  {item.status}
                </Badge>
                <span className="muted mono">{item.decidedAt ?? item.createdAt}</span>
              </div>
              <strong>{item.intentKind}</strong>
              <span className="muted">{item.summary}</span>
            </div>
          ))}
          {steps.slice().reverse().map(step => (
            <div className="approval-row" key={step.id ?? `${step.type}-${step.timestamp}`}>
              <div className="toolbar-line">
                <Badge tone="neutral">{step.type}</Badge>
                <span className="muted mono">{new Date(step.timestamp).toLocaleString()}</span>
              </div>
              <span>{step.content}</span>
            </div>
          ))}
          {approvals.length === 0 && steps.length === 0 && <p className="muted">No audit events in this renderer session.</p>}
        </div>
      </section>
    </div>
  )
}
