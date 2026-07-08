import type { AgentRunStep } from '@shared/types/agent.types'
import { FileWarning } from 'lucide-react'
import { useAgentStore } from '../stores/agent.store'
import { Badge } from '../components/ui/Badge'

export default function RiskReports(): React.ReactElement {
  const findings = useAgentStore(state => state.riskFindings)
  const steps = useAgentStore(state => state.steps)
  const derived = findings.length > 0 ? findings.map(item => ({
    id: item.id,
    title: item.target ?? item.service ?? 'Risk finding',
    score: item.riskScore,
    recommendation: item.recommendation,
  })) : deriveFindingsFromSteps(steps)

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <FileWarning size={17} />
            Risk Reports
          </div>
          <Badge tone={derived.length > 0 ? 'warning' : 'success'}>{derived.length} findings</Badge>
        </div>
        <div className="panel-body">
          {derived.map(item => (
            <div className="approval-row" key={item.id}>
              <div className="toolbar-line">
                <strong>{item.title}</strong>
                <Badge tone={item.score >= 80 ? 'critical' : item.score >= 60 ? 'danger' : item.score >= 40 ? 'warning' : 'neutral'}>
                  {item.score}/100
                </Badge>
              </div>
              <span className="muted">{item.recommendation}</span>
            </div>
          ))}
          {derived.length === 0 && <p className="muted">No risk findings have been promoted from observations yet.</p>}
        </div>
      </section>
    </div>
  )
}

function deriveFindingsFromSteps(steps: AgentRunStep[]): Array<{
  id: string
  title: string
  score: number
  recommendation: string
}> {
  return steps
    .filter(step => /critical|cve|denied|external|high risk/i.test(step.content))
    .slice(-8)
    .reverse()
    .map(step => ({
      id: step.id ?? `${step.type}-${step.timestamp}`,
      title: step.toolCall?.name ?? step.type,
      score: /critical|cve/i.test(step.content) ? 86 : /external|high risk/i.test(step.content) ? 68 : 45,
      recommendation: step.content,
    }))
}
