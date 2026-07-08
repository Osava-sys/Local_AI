import { Shield, Terminal } from 'lucide-react'
import { useApproval } from '../hooks/use-approval'
import { useAgentStore } from '../stores/agent.store'
import { Badge } from '../components/ui/Badge'

export default function Sandbox(): React.ReactElement {
  const { pending, recent } = useApproval()
  const steps = useAgentStore(state => state.steps)
  const toolSteps = steps.filter(step => step.toolCall)

  return (
    <div className="page">
      <div className="page-grid">
        <section className="panel" style={{ gridColumn: 'span 5' }}>
          <div className="panel-header">
            <div className="panel-title">
              <Shield size={17} />
              Sandbox Boundary
            </div>
            <Badge tone={pending.length > 0 ? 'warning' : 'success'}>
              {pending.length > 0 ? 'Approval gate active' : 'Ready'}
            </Badge>
          </div>
          <div className="panel-body">
            <dl className="kv-grid">
              <dt>renderer</dt>
              <dd>window.api only</dd>
              <dt>pending</dt>
              <dd>{pending.length}</dd>
              <dt>decisions</dt>
              <dd>{recent.length}</dd>
              <dt>tool intents</dt>
              <dd>{toolSteps.length}</dd>
            </dl>
          </div>
        </section>

        <section className="panel" style={{ gridColumn: 'span 7' }}>
          <div className="panel-header">
            <div className="panel-title">
              <Terminal size={17} />
              Intent Stream
            </div>
          </div>
          <div className="panel-body">
            {toolSteps.slice(-8).reverse().map(step => (
              <div className="log-row" key={step.id ?? `${step.type}-${step.timestamp}`}>
                <Badge tone={step.toolCall?.status === 'requires_approval' ? 'warning' : 'accent'}>
                  {step.toolCall?.status ?? step.type}
                </Badge>
                <strong>{step.toolCall?.name}</strong>
                <pre className="log-block">{JSON.stringify(step.toolCall?.args ?? {}, null, 2)}</pre>
              </div>
            ))}
            {toolSteps.length === 0 && <p className="muted">No tool intents in the current renderer session.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
