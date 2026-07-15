import { FileWarning } from 'lucide-react'
import type { AgentRunStep } from '@shared/types/agent.types'
import { useAgentStore } from '../stores/agent.store'
import { extractReport, riskTone } from '../lib/report'
import { Badge } from '../components/ui/Badge'
import { StructuredReport } from '../components/reports/StructuredReport'

export default function RiskReports(): React.ReactElement {
  const storeFindings = useAgentStore(state => state.riskFindings)
  const steps = useAgentStore(state => state.steps)
  const report = extractReport(steps)
  const derived = storeFindings.length > 0
    ? storeFindings.map(item => ({
        id: item.id,
        title: item.target ?? item.service ?? 'Finding de risque',
        score: item.riskScore,
        recommendation: item.recommendation,
      }))
    : deriveFindingsFromSteps(steps)

  const count = report ? report.findings.length : derived.length

  return (
    <div className="page">
      <div className="page-head">
        <div className="toolbar-line">
          <div>
            <h1>Rapports de risque</h1>
            <p>Findings priorisés et recommandations issus des observations du run.</p>
          </div>
          <Badge tone={count > 0 ? 'warning' : 'success'}>
            <FileWarning size={13} />
            {count} finding{count > 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {report ? (
        <section className="panel">
          <div className="panel-body">
            <StructuredReport report={report} />
          </div>
        </section>
      ) : derived.length > 0 ? (
        <section className="panel">
          <div className="panel-body reco-list">
            {derived.map(item => (
              <div className="reco-card" key={item.id} data-tone={riskTone(item.score)}>
                <div className="reco-card__head">
                  <span className="risk-chip" data-risk={scoreLevel(item.score)}>
                    {scoreLevel(item.score).toUpperCase()}
                  </span>
                  <strong>{item.title}</strong>
                  <span className="mono muted" style={{ marginLeft: 'auto' }}>
                    {item.score}/100
                  </span>
                </div>
                <p className="reco-fix">{item.recommendation}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="empty-state">
            <FileWarning size={26} />
            <strong>Aucun finding de risque</strong>
            <span className="muted">Les findings apparaissent une fois les observations analysées.</span>
          </div>
        </section>
      )}
    </div>
  )
}

function scoreLevel(score: number): string {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
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
