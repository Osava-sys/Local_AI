import { AlertTriangle, Bot, ClipboardCheck, Package, ShieldCheck } from 'lucide-react'
import type { AgentRunStep, AgentState } from '@shared/types/agent.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import type { AppRouteId } from '../routes'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StepContent } from '../components/reports/StructuredReport'

const STEP_LABEL: Record<string, string> = {
  thought: 'Raisonnement',
  reason: 'Raisonnement',
  action: 'Action',
  act: 'Action',
  observation: 'Observation',
  observe: 'Observation',
}

function stepTone(type: string): BadgeTone {
  if (type === 'action' || type === 'act') return 'accent'
  if (type === 'observation' || type === 'observe') return 'success'
  return 'neutral'
}

interface DashboardProps {
  agentState: AgentState | 'starting'
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: number
  steps: AgentRunStep[]
  onNavigate(route: AppRouteId): void
}

export default function Dashboard({
  agentState,
  modelStatus,
  pendingApprovals,
  steps,
  onNavigate,
}: DashboardProps): React.ReactElement {
  const toolSteps = steps.filter(step => step.toolCall)
  const observations = steps.filter(step => step.type === 'observe' || step.type === 'observation')

  return (
    <div className="page">
      <div className="page-grid">
        <section className="panel" style={{ gridColumn: 'span 6' }}>
          <div className="panel-header">
            <div className="panel-title">
              <Bot size={17} />
              Agent
            </div>
            <Badge tone={agentState === 'running' ? 'accent' : agentState === 'awaiting_approval' ? 'warning' : 'neutral'}>
              {agentState}
            </Badge>
          </div>
          <div className="panel-body">
            <div className="dashboard-row">
              <strong>{steps.length} steps</strong>
              <span className="muted">
                {observations.length} observations, {toolSteps.length} tool intents
              </span>
            </div>
            <Button variant="primary" onClick={() => onNavigate('agent-runs')}>
              Open Agent Graph
            </Button>
          </div>
        </section>

        <section className="panel" style={{ gridColumn: 'span 3' }}>
          <div className="panel-header">
            <div className="panel-title">
              <Package size={17} />
              Model
            </div>
          </div>
          <div className="panel-body">
            <strong>{modelStatus?.state === 'running' ? 'Loaded' : modelStatus?.state ?? 'Idle'}</strong>
            <p className="muted">{modelStatus?.modelName ?? 'No active local model'}</p>
          </div>
        </section>

        <section className="panel" style={{ gridColumn: 'span 3' }}>
          <div className="panel-header">
            <div className="panel-title">
              <ClipboardCheck size={17} />
              Approvals
            </div>
          </div>
          <div className="panel-body">
            <strong>{pendingApprovals} pending</strong>
            <p className="muted">Human gate for sensitive actions</p>
          </div>
        </section>

        <section className="panel" style={{ gridColumn: 'span 6' }}>
          <div className="panel-header">
            <div className="panel-title">
              <ShieldCheck size={17} />
              Safety Boundary
            </div>
            <Badge tone="success">Renderer allowlisted</Badge>
          </div>
          <div className="panel-body">
            <div className="dashboard-row">
              <strong>{'Agent decides -> intent -> approval -> sandbox -> audit'}</strong>
              <span className="muted">Renderer uses window.api and never direct host APIs.</span>
            </div>
          </div>
        </section>

        <section className="panel" style={{ gridColumn: 'span 6' }}>
          <div className="panel-header">
            <div className="panel-title">
              <AlertTriangle size={17} />
              Recent Activity
            </div>
          </div>
          <div className="panel-body">
            {steps.length === 0 ? (
              <p className="muted">Aucun évènement de run.</p>
            ) : (
              <ol className="timeline">
                {steps
                  .slice(-5)
                  .reverse()
                  .map(step => (
                    <li
                      className="timeline-item"
                      data-tone={stepTone(step.type)}
                      key={step.id ?? `${step.type}-${step.timestamp}`}
                    >
                      <div className="timeline-marker" />
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <Badge tone={stepTone(step.type)}>{STEP_LABEL[step.type] ?? step.type}</Badge>
                          <time className="mono muted">
                            {new Date(step.timestamp).toLocaleTimeString('fr-FR', { hour12: false })}
                          </time>
                        </div>
                        <StepContent content={step.content} />
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
