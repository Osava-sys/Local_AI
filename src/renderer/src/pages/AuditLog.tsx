import { History } from 'lucide-react'
import type { AgentRunStep } from '@shared/types/agent.types'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import { useApproval } from '../hooks/use-approval'
import { useAgentStore } from '../stores/agent.store'
import { Badge, type BadgeTone } from '../components/ui/Badge'
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

function approvalTone(status: string): BadgeTone {
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  return 'danger'
}

interface TimelineEntry {
  id: string
  kind: 'approval' | 'step'
  type: string
  tone: BadgeTone
  time: number
  approval?: ApprovalRequestView
  step?: AgentRunStep
}

export default function AuditLog(): React.ReactElement {
  const { pending, recent } = useApproval()
  const steps = useAgentStore(state => state.steps)

  const entries: TimelineEntry[] = [
    ...[...pending, ...recent].map(item => ({
      id: `approval-${item.id}`,
      kind: 'approval' as const,
      type: item.status,
      tone: approvalTone(item.status),
      time: new Date(item.decidedAt ?? item.createdAt).getTime() || Date.now(),
      approval: item,
    })),
    ...steps.map((step, index) => ({
      id: step.id ?? `step-${index}`,
      kind: 'step' as const,
      type: step.type,
      tone: stepTone(step.type),
      time: step.timestamp,
      step,
    })),
  ].sort((a, b) => b.time - a.time)

  return (
    <div className="page">
      <div className="page-head">
        <div className="toolbar-line">
          <div>
            <h1>Journal d’audit</h1>
            <p>Trace chronologique des décisions, actions et observations de l’agent.</p>
          </div>
          <Badge tone={entries.length > 0 ? 'accent' : 'neutral'}>
            <History size={13} />
            {entries.length} évènement{entries.length > 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      <section className="panel">
        <div className="panel-body">
          {entries.length === 0 ? (
            <div className="empty-state">
              <History size={26} />
              <strong>Aucun évènement d’audit</strong>
              <span className="muted">La trace se remplit dès qu’un run démarre.</span>
            </div>
          ) : (
            <ol className="timeline">
              {entries.map(entry => (
                <li className="timeline-item" data-tone={entry.tone} key={entry.id}>
                  <div className="timeline-marker" />
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <Badge tone={entry.tone}>
                        {entry.kind === 'approval' ? entry.type : STEP_LABEL[entry.type] ?? entry.type}
                      </Badge>
                      {entry.kind === 'approval' && entry.approval && (
                        <span className="mono">{entry.approval.intentKind}</span>
                      )}
                      <time className="mono muted">{new Date(entry.time).toLocaleString('fr-FR')}</time>
                    </div>
                    {entry.kind === 'approval' && entry.approval ? (
                      <p className="muted">{entry.approval.summary}</p>
                    ) : entry.step ? (
                      <StepContent content={entry.step.content} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}
