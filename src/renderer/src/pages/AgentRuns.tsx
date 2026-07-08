import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  FileText,
  FlaskConical,
  History,
  MessageSquareText,
  Play,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AgentRunStep, AgentState } from '@shared/types/agent.types'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Tabs, type TabItem } from '../components/ui/Tabs'

type AgentUiState = AgentState | 'starting'
type BottomTab = 'console' | 'observations' | 'audit' | 'report'
type GraphNodeStatus =
  | 'pending'
  | 'active'
  | 'running'
  | 'awaiting_approval'
  | 'blocked'
  | 'error'
  | 'done'
  | 'critical'
type GraphNodeId =
  | 'prompt'
  | 'agent'
  | 'reasoning'
  | 'tool-intent'
  | 'approval'
  | 'sandbox'
  | 'observation'
  | 'risk'
  | 'report'

interface GraphNode {
  id: GraphNodeId
  title: string
  subtitle: string
  x: number
  y: number
  icon: LucideIcon
  status: GraphNodeStatus
  runId?: string
  tool?: string
  target?: string
  durationMs?: number
  riskScore: number
  recommendations: string[]
  history: string[]
  json: Record<string, unknown>
}

interface AgentRunsProps {
  prompt: string
  currentRunId: string | null
  state: AgentUiState
  steps: AgentRunStep[]
  error: string | null
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: ApprovalRequestView[]
  recentApprovals: ApprovalRequestView[]
  onPromptChange(prompt: string): void
  onStart(): void
  onStop(): void
  onNewRun(): void
}

const NODE_ORDER: GraphNodeId[] = [
  'prompt',
  'agent',
  'reasoning',
  'tool-intent',
  'approval',
  'sandbox',
  'observation',
  'risk',
  'report',
]

const EDGES: Array<[GraphNodeId, GraphNodeId]> = [
  ['prompt', 'agent'],
  ['agent', 'reasoning'],
  ['reasoning', 'tool-intent'],
  ['tool-intent', 'approval'],
  ['approval', 'sandbox'],
  ['sandbox', 'observation'],
  ['observation', 'reasoning'],
  ['observation', 'risk'],
  ['risk', 'report'],
]

const BOTTOM_TABS: TabItem<BottomTab>[] = [
  { id: 'console', label: 'Console' },
  { id: 'observations', label: 'Observations' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'report', label: 'Report JSON' },
]

const SAMPLE_STEPS: AgentRunStep[] = [
  {
    id: 'sample-reason',
    type: 'reason',
    content: 'Assess local posture first, then request approval before any external scan.',
    metadata: { tokensUsed: 212, durationMs: 820, confidenceScore: 0.81 },
    timestamp: Date.now() - 120000,
  },
  {
    id: 'sample-action',
    type: 'act',
    content: 'Prepare network inventory intent for localhost and RFC1918 ranges.',
    toolCall: {
      id: 'sample-tool',
      name: 'nmap',
      args: { target: '192.168.1.0/24', scanType: 'version' },
      status: 'requires_approval',
    },
    metadata: { tokensUsed: 126, durationMs: 540, confidenceScore: 0.74 },
    timestamp: Date.now() - 90000,
  },
  {
    id: 'sample-observe',
    type: 'observe',
    content: 'Observation channel waiting for sandbox output after human approval.',
    metadata: { tokensUsed: 64, durationMs: 120, confidenceScore: 0.66 },
    timestamp: Date.now() - 60000,
  },
]

export default function AgentRuns({
  prompt,
  currentRunId,
  state,
  steps,
  error,
  modelStatus,
  pendingApprovals,
  recentApprovals,
  onPromptChange,
  onStart,
  onStop,
  onNewRun,
}: AgentRunsProps): React.ReactElement {
  const [selectedNodeId, setSelectedNodeId] = useState<GraphNodeId>('agent')
  const [bottomTab, setBottomTab] = useState<BottomTab>('console')
  const [search, setSearch] = useState('')
  const [stepFilter, setStepFilter] = useState('all')
  const [toolFilter, setToolFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [contextMenu, setContextMenu] = useState<{ nodeId: GraphNodeId; x: number; y: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isDemo = steps.length === 0 && !currentRunId
  const displaySteps = isDemo ? SAMPLE_STEPS : steps
  const graphState = isDemo ? 'awaiting_approval' : state
  const nodes = useMemo(
    () =>
      buildGraphNodes({
        prompt,
        currentRunId: currentRunId ?? (isDemo ? 'sample-run' : null),
        state: graphState,
        steps: displaySteps,
        error,
        modelStatus,
        pendingApprovals,
        recentApprovals,
        isDemo,
      }),
    [currentRunId, displaySteps, error, graphState, isDemo, modelStatus, pendingApprovals, prompt, recentApprovals],
  )
  const selectedNode = nodes.find(node => node.id === selectedNodeId) ?? nodes[1]
  const filteredNodes = nodes.filter(node =>
    [node.title, node.subtitle, node.tool, node.target].join(' ').toLowerCase().includes(search.toLowerCase()),
  )
  const observations = displaySteps.filter(step => step.type === 'observation' || step.type === 'observe')
  const hypotheses = displaySteps.filter(step => step.type === 'thought' || step.type === 'reason')
  const visibleLogs = displaySteps.filter(step => {
    const matchesStep = stepFilter === 'all' || step.type === stepFilter
    const matchesTool =
      toolFilter.trim().length === 0 ||
      step.toolCall?.name.toLowerCase().includes(toolFilter.trim().toLowerCase()) ||
      step.content.toLowerCase().includes(toolFilter.trim().toLowerCase())
    const riskText = [...pendingApprovals, ...recentApprovals].map(item => item.risk ?? '').join(' ')
    const matchesRisk = riskFilter === 'all' || riskText.includes(riskFilter) || step.content.toLowerCase().includes(riskFilter)
    return matchesStep && matchesTool && matchesRisk
  })
  const reportJson = {
    demo: isDemo,
    runId: currentRunId,
    state,
    model: modelStatus,
    pendingApprovals: pendingApprovals.length,
    steps: displaySteps,
    graph: nodes.map(node => ({
      id: node.id,
      title: node.title,
      status: node.status,
      riskScore: node.riskScore,
      tool: node.tool,
      target: node.target,
    })),
  }

  function copy(value: unknown): void {
    void navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    setNotice('Copied')
    window.setTimeout(() => setNotice(null), 1400)
  }

  function openContextMenu(event: React.MouseEvent, nodeId: GraphNodeId): void {
    event.preventDefault()
    setSelectedNodeId(nodeId)
    setContextMenu({ nodeId, x: event.clientX, y: event.clientY })
  }

  return (
    <div className="agent-workspace" onClick={() => setContextMenu(null)}>
      <section className="panel graph-panel" aria-label="Agent graph">
        <div className="graph-toolbar">
          <div className="header-cluster">
            <Badge tone={isDemo ? 'warning' : 'accent'}>{isDemo ? 'Sample demo' : 'Live run'}</Badge>
            <Badge tone={getStateTone(graphState)}>{formatState(graphState)}</Badge>
          </div>
          <div className="header-cluster">
            <Button size="sm" variant="primary" onClick={onStart}>
              <Play size={14} />
              Start
            </Button>
            <Button disabled={!currentRunId} size="sm" variant="subtle" onClick={onStop}>
              Stop
            </Button>
            <Button size="sm" variant="ghost" onClick={onNewRun}>
              New Run
            </Button>
          </div>
        </div>

        <div className="graph-canvas">
          <svg className="graph-edges" preserveAspectRatio="none" viewBox="0 0 100 100">
            {EDGES.map(([fromId, toId]) => {
              const from = nodes.find(node => node.id === fromId)
              const to = nodes.find(node => node.id === toId)
              if (!from || !to) return null
              const active = isActiveEdge(from, to)
              return (
                <path
                  className={['graph-edge', active ? 'is-active' : ''].filter(Boolean).join(' ')}
                  d={curvePath(from, to)}
                  key={`${fromId}-${toId}`}
                />
              )
            })}
          </svg>

          {NODE_ORDER.map(id => {
            const node = nodes.find(item => item.id === id)
            if (!node) return null
            const Icon = node.icon
            return (
              <button
                className={['graph-node', selectedNodeId === id ? 'is-selected' : ''].filter(Boolean).join(' ')}
                data-status={node.status}
                key={node.id}
                style={{ left: `calc(${node.x}% - 95px)`, top: `calc(${node.y}% - 33px)` }}
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  setSelectedNodeId(node.id)
                }}
                onContextMenu={event => openContextMenu(event, node.id)}
              >
                <span className="graph-node-icon">
                  <Icon size={18} />
                </span>
                <span className="graph-node-title">
                  <strong>{node.title}</strong>
                  <span>{node.subtitle}</span>
                </span>
              </button>
            )
          })}
        </div>

        {contextMenu && (
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={event => event.stopPropagation()}
          >
            <button type="button" onClick={() => setSelectedNodeId(contextMenu.nodeId)}>
              <Search size={14} />
              View details
            </button>
            <button type="button" onClick={() => copy(nodes.find(node => node.id === contextMenu.nodeId)?.json ?? {})}>
              <Copy size={14} />
              Copy JSON
            </button>
            <button type="button" onClick={() => setBottomTab('audit')}>
              <History size={14} />
              Open audit
            </button>
            <button type="button" onClick={() => setSelectedNodeId('tool-intent')}>
              <Terminal size={14} />
              Inspect tool intent
            </button>
            <button type="button" onClick={() => setNotice('Marked as reviewed')}>
              <CheckCircle2 size={14} />
              Mark as reviewed
            </button>
          </div>
        )}
      </section>

      <aside className="panel inspector-panel">
        <div className="panel-header">
          <div className="panel-title">
            <Search size={16} />
            Inspector
          </div>
        </div>
        <div className="inspector-body">
          <Input placeholder="Search nodes, tools, targets" value={search} onChange={event => setSearch(event.target.value)} />
          {search && (
            <div className="history-row">
              {filteredNodes.slice(0, 5).map(node => (
                <button className="button button--ghost button--sm" key={node.id} type="button" onClick={() => setSelectedNodeId(node.id)}>
                  {node.title}
                </button>
              ))}
            </div>
          )}

          <section>
            <div className="toolbar-line">
              <strong>Prompt</strong>
            </div>
            <Textarea value={prompt} onChange={event => onPromptChange(event.target.value)} />
          </section>

          <section>
            <div className="toolbar-line">
              <div>
                <strong>{selectedNode.title}</strong>
                <div className="muted">{selectedNode.subtitle}</div>
              </div>
              <Badge tone={getNodeTone(selectedNode.status)}>{selectedNode.status}</Badge>
            </div>
          </section>

          <dl className="kv-grid">
            <dt>runId</dt>
            <dd className="truncate">{selectedNode.runId ?? 'none'}</dd>
            <dt>tool</dt>
            <dd>{selectedNode.tool ?? 'none'}</dd>
            <dt>target</dt>
            <dd className="truncate">{selectedNode.target ?? 'local workspace'}</dd>
            <dt>status</dt>
            <dd>{selectedNode.status}</dd>
            <dt>duration</dt>
            <dd>{selectedNode.durationMs ? `${selectedNode.durationMs} ms` : 'pending'}</dd>
          </dl>

          <section>
            <div className="toolbar-line">
              <strong>Risk score</strong>
              <span className="mono">{selectedNode.riskScore}/100</span>
            </div>
            <div className="risk-meter" data-risk={scoreRisk(selectedNode.riskScore)}>
              <span style={{ width: `${selectedNode.riskScore}%` }} />
            </div>
          </section>

          <section>
            <strong>Recommendations</strong>
            <div className="history-row">
              {selectedNode.recommendations.map(item => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>

          <section>
            <div className="toolbar-line">
              <strong>JSON</strong>
              <Button size="sm" variant="ghost" onClick={() => copy(selectedNode.json)}>
                <Copy size={14} />
                Copy
              </Button>
            </div>
            <pre className="json-block">{JSON.stringify(selectedNode.json, null, 2)}</pre>
          </section>

          <section>
            <strong>History</strong>
            <div>
              {selectedNode.history.slice(0, 4).map(item => (
                <div className="history-row" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>

      <section className="panel bottom-panel">
        <div className="panel-header">
          <Tabs active={bottomTab} tabs={BOTTOM_TABS} onChange={id => setBottomTab(id as BottomTab)} />
          <div className="header-cluster">
            <Select aria-label="Step filter" value={stepFilter} onChange={event => setStepFilter(event.target.value)}>
              <option value="all">All steps</option>
              <option value="reason">Reason</option>
              <option value="act">Act</option>
              <option value="observe">Observe</option>
              <option value="thought">Thought</option>
              <option value="action">Action</option>
              <option value="observation">Observation</option>
            </Select>
            <Input aria-label="Tool filter" placeholder="tool" value={toolFilter} onChange={event => setToolFilter(event.target.value)} />
            <Select aria-label="Risk filter" value={riskFilter} onChange={event => setRiskFilter(event.target.value)}>
              <option value="all">All risk</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => copy(bottomTab === 'report' ? reportJson : visibleLogs)}>
              <Copy size={14} />
              Copy
            </Button>
          </div>
        </div>
        <div className="bottom-content">
          {bottomTab === 'console' && (
            <ConsolePanel error={error} steps={visibleLogs} />
          )}
          {bottomTab === 'observations' && (
            <ObservationsPanel hypotheses={hypotheses} observations={observations} />
          )}
          {bottomTab === 'audit' && (
            <AuditPanel pendingApprovals={pendingApprovals} recentApprovals={recentApprovals} steps={visibleLogs} />
          )}
          {bottomTab === 'report' && <pre className="json-block">{JSON.stringify(reportJson, null, 2)}</pre>}
        </div>
      </section>
      {notice && <div className="toast-region"><div className="toast"><strong>{notice}</strong></div></div>}
    </div>
  )
}

function ConsolePanel({ steps, error }: { steps: AgentRunStep[]; error: string | null }): React.ReactElement {
  if (steps.length === 0 && !error) {
    return (
      <div className="empty-state">
        <Terminal size={24} />
        <strong>No console events</strong>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="log-row">
          <Badge tone="danger">Error</Badge>
          <pre className="log-block">{error}</pre>
        </div>
      )}
      {steps.map(step => (
        <div className="log-row" key={step.id ?? `${step.type}-${step.timestamp}`}>
          <div className="toolbar-line">
            <Badge tone={getStepTone(step)}>{step.type}</Badge>
            <span className="muted mono">{formatTime(step.timestamp)}</span>
          </div>
          <pre className="log-block">{step.content}</pre>
          {step.toolCall && (
            <span className="muted">
              {step.toolCall.name} · {step.toolCall.status}
            </span>
          )}
        </div>
      ))}
    </>
  )
}

function ObservationsPanel({
  observations,
  hypotheses,
}: {
  observations: AgentRunStep[]
  hypotheses: AgentRunStep[]
}): React.ReactElement {
  return (
    <div className="page-grid">
      <section style={{ gridColumn: 'span 6' }}>
        <div className="panel-title">
          <FlaskConical size={16} />
          Observations
        </div>
        {observations.length === 0 ? (
          <p className="muted">No sandbox observations yet.</p>
        ) : (
          observations.map(step => (
            <div className="log-row" key={step.id ?? `${step.type}-${step.timestamp}`}>
              <pre className="log-block">{step.observation ?? step.content}</pre>
            </div>
          ))
        )}
      </section>
      <section style={{ gridColumn: 'span 6' }}>
        <div className="panel-title">
          <Sparkles size={16} />
          Hypotheses
        </div>
        {hypotheses.length === 0 ? (
          <p className="muted">No reasoning steps yet.</p>
        ) : (
          hypotheses.map(step => (
            <div className="log-row" key={step.id ?? `${step.type}-${step.timestamp}`}>
              <pre className="log-block">{step.content}</pre>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function AuditPanel({
  steps,
  pendingApprovals,
  recentApprovals,
}: {
  steps: AgentRunStep[]
  pendingApprovals: ApprovalRequestView[]
  recentApprovals: ApprovalRequestView[]
}): React.ReactElement {
  const approvals = [...pendingApprovals, ...recentApprovals]
  return (
    <>
      {approvals.map(item => (
        <div className="approval-row" key={item.id}>
          <div className="toolbar-line">
            <Badge tone={item.status === 'pending' ? 'warning' : item.status === 'approved' ? 'success' : 'danger'}>
              {item.status}
            </Badge>
            <span className="muted mono">{item.createdAt}</span>
          </div>
          <strong>
            {item.intentKind} · {item.risk ?? 'high'}
          </strong>
          <span className="muted">{item.summary}</span>
        </div>
      ))}
      {steps
        .filter(step => step.toolCall)
        .map(step => (
          <div className="approval-row" key={step.id ?? `${step.type}-${step.timestamp}`}>
            <Badge tone={getStepTone(step)}>{step.toolCall?.status ?? step.type}</Badge>
            <span>
              {step.toolCall?.name} · {step.content}
            </span>
          </div>
        ))}
      {approvals.length === 0 && steps.every(step => !step.toolCall) && (
        <div className="empty-state">
          <History size={24} />
          <strong>No audit events yet</strong>
        </div>
      )}
    </>
  )
}

function buildGraphNodes(input: {
  prompt: string
  currentRunId: string | null
  state: AgentUiState
  steps: AgentRunStep[]
  error: string | null
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: ApprovalRequestView[]
  recentApprovals: ApprovalRequestView[]
  isDemo: boolean
}): GraphNode[] {
  const latestReason = latest(input.steps, ['reason', 'thought'])
  const latestAction = latest(input.steps, ['act', 'action'])
  const latestObservation = latest(input.steps, ['observe', 'observation'])
  const pendingApproval = input.pendingApprovals[0]
  const latestApproval = pendingApproval ?? input.recentApprovals[0]
  const tool = latestAction?.toolCall?.name ?? latestApproval?.intentKind
  const target = inferTarget(latestAction) ?? latestApproval?.summary
  const riskScore = riskScoreFrom(input.pendingApprovals, input.steps)
  const approvalStatus: GraphNodeStatus = pendingApproval
    ? 'awaiting_approval'
    : latestApproval?.status === 'approved'
      ? 'done'
      : latestApproval?.status === 'rejected'
        ? 'blocked'
        : 'pending'
  const sandboxStatus: GraphNodeStatus = latestAction?.toolCall?.status === 'running'
    ? 'running'
    : latestAction?.toolCall?.status === 'done'
      ? 'done'
      : latestAction?.toolCall?.status === 'error'
        ? 'error'
        : approvalStatus === 'done'
          ? 'active'
          : 'pending'
  const reportStatus: GraphNodeStatus =
    input.state === 'done' ? 'done' : input.state === 'error' ? 'error' : input.state === 'blocked' ? 'blocked' : 'pending'
  const history = input.steps
    .slice(-5)
    .reverse()
    .map(step => `${step.type}: ${trim(step.content, 90)}`)

  return [
    {
      id: 'prompt',
      title: 'User Prompt',
      subtitle: trim(input.prompt, 42),
      x: 13,
      y: 47,
      icon: MessageSquareText,
      status: input.currentRunId ? 'done' : 'pending',
      runId: input.currentRunId ?? undefined,
      riskScore: 8,
      recommendations: ['Keep scope explicit', 'Prefer local diagnostics first'],
      history,
      json: { prompt: input.prompt, demo: input.isDemo },
    },
    {
      id: 'agent',
      title: 'Nexus Agent',
      subtitle: formatState(input.state),
      x: 28,
      y: 47,
      icon: Bot,
      status: agentNodeStatus(input.state),
      runId: input.currentRunId ?? undefined,
      durationMs: duration(input.steps),
      riskScore: 18,
      recommendations: ['Ground decisions in observations', 'Escalate sensitive actions'],
      history,
      json: { runId: input.currentRunId, state: input.state, model: input.modelStatus },
    },
    {
      id: 'reasoning',
      title: 'Reasoning',
      subtitle: latestReason ? trim(latestReason.content, 38) : 'Pending plan',
      x: 43,
      y: 28,
      icon: Sparkles,
      status: latestReason ? 'done' : input.state === 'running' ? 'active' : 'pending',
      runId: input.currentRunId ?? undefined,
      durationMs: latestReason?.metadata?.durationMs,
      riskScore: 22,
      recommendations: ['Keep hypotheses separate from observations'],
      history: latestReason ? [latestReason.content, ...history] : history,
      json: latestReason ? { ...latestReason } : { status: 'pending' },
    },
    {
      id: 'tool-intent',
      title: 'Tool Intent',
      subtitle: tool ? `${tool}${target ? ` -> ${trim(target, 26)}` : ''}` : 'No tool selected',
      x: 58,
      y: 28,
      icon: Code2,
      status: latestAction ? toolStatus(latestAction) : 'pending',
      runId: input.currentRunId ?? undefined,
      tool,
      target,
      durationMs: latestAction?.metadata?.durationMs,
      riskScore: Math.max(30, riskScore),
      recommendations: ['Render intent before execution', 'Route through sandbox only'],
      history: latestAction ? [latestAction.content, ...history] : history,
      json: latestAction ? { ...latestAction } : { status: 'pending' },
    },
    {
      id: 'approval',
      title: 'Approval',
      subtitle: pendingApproval ? trim(pendingApproval.summary, 36) : latestApproval ? latestApproval.status : 'No approval needed',
      x: 73,
      y: 28,
      icon: ClipboardCheck,
      status: approvalStatus,
      runId: latestApproval?.runId ?? input.currentRunId ?? undefined,
      tool: latestApproval?.intentKind,
      target: latestApproval?.summary,
      riskScore,
      recommendations: pendingApproval
        ? ['Review target and scope', 'Reject ambiguous or external actions']
        : ['Sensitive actions remain gated'],
      history: latestApproval ? [latestApproval.reason, ...history] : history,
      json: latestApproval ? { ...latestApproval } : { status: 'clear' },
    },
    {
      id: 'sandbox',
      title: 'Sandbox Execution',
      subtitle: sandboxStatus === 'pending' ? 'Waiting for approved intent' : 'Executor boundary active',
      x: 58,
      y: 67,
      icon: Terminal,
      status: sandboxStatus,
      runId: input.currentRunId ?? undefined,
      tool,
      target,
      durationMs: latestAction?.metadata?.durationMs,
      riskScore: Math.max(35, riskScore),
      recommendations: ['Bound output and timeout', 'Use allowlisted IPC only'],
      history,
      json: { status: sandboxStatus, tool, target },
    },
    {
      id: 'observation',
      title: 'Observation',
      subtitle: latestObservation ? trim(latestObservation.observation ?? latestObservation.content, 42) : 'No observation yet',
      x: 43,
      y: 67,
      icon: FlaskConical,
      status: latestObservation ? 'done' : 'pending',
      runId: input.currentRunId ?? undefined,
      durationMs: latestObservation?.metadata?.durationMs,
      riskScore: 24,
      recommendations: ['Record only observed output here'],
      history: latestObservation ? [latestObservation.content, ...history] : history,
      json: latestObservation ? { ...latestObservation } : { status: 'pending' },
    },
    {
      id: 'risk',
      title: 'Risk Finding',
      subtitle: riskScore >= 70 ? 'High priority finding' : riskScore >= 40 ? 'Review recommended' : 'No critical finding',
      x: 76,
      y: 67,
      icon: riskScore >= 80 ? ShieldAlert : AlertTriangle,
      status: riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'blocked' : riskScore >= 35 ? 'awaiting_approval' : 'pending',
      runId: input.currentRunId ?? undefined,
      tool,
      target,
      riskScore,
      recommendations: ['Rank by evidence', 'Do not promote hypotheses into findings'],
      history,
      json: { score: riskScore, approvals: input.pendingApprovals, steps: input.steps.length },
    },
    {
      id: 'report',
      title: 'Final Report',
      subtitle: reportStatus === 'done' ? 'Ready' : 'Building from observations',
      x: 90,
      y: 47,
      icon: FileText,
      status: reportStatus,
      runId: input.currentRunId ?? undefined,
      durationMs: duration(input.steps),
      riskScore,
      recommendations: ['Summarize evidence, approvals, and residual risk'],
      history,
      json: { status: reportStatus, runId: input.currentRunId, steps: input.steps.length, error: input.error },
    },
  ]
}

function latest(steps: AgentRunStep[], types: AgentRunStep['type'][]): AgentRunStep | undefined {
  return [...steps].reverse().find(step => types.includes(step.type))
}

function inferTarget(step?: AgentRunStep): string | undefined {
  if (!step?.toolCall) return undefined
  const args = step.toolCall.args
  const keys = ['target', 'url', 'path', 'command', 'networkTarget', 'cwd']
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value
    if (Array.isArray(value) && value.length > 0) return value.join(', ')
  }
  return undefined
}

function toolStatus(step: AgentRunStep): GraphNodeStatus {
  const status = step.toolCall?.status
  if (status === 'requires_approval') return 'awaiting_approval'
  if (status === 'running') return 'running'
  if (status === 'done' || status === 'approved') return 'done'
  if (status === 'error' || status === 'rejected') return 'error'
  return 'active'
}

function agentNodeStatus(state: AgentUiState): GraphNodeStatus {
  if (state === 'running' || state === 'planning' || state === 'starting') return 'active'
  if (state === 'awaiting_approval') return 'awaiting_approval'
  if (state === 'done') return 'done'
  if (state === 'blocked') return 'blocked'
  if (state === 'error') return 'error'
  return 'pending'
}

function riskScoreFrom(approvals: ApprovalRequestView[], steps: AgentRunStep[]): number {
  const riskRank: Record<string, number> = { low: 18, medium: 42, high: 68, critical: 92 }
  const approvalScore = approvals.reduce((score, item) => Math.max(score, riskRank[item.risk ?? 'high'] ?? 68), 0)
  const content = steps.map(step => `${step.content} ${step.observation ?? ''}`).join(' ').toLowerCase()
  const contentScore =
    content.includes('critical') || content.includes('cve')
      ? 80
      : content.includes('external') || content.includes('denied')
        ? 62
        : content.includes('warning')
          ? 45
          : 20
  return Math.max(approvalScore, contentScore)
}

function duration(steps: AgentRunStep[]): number | undefined {
  const total = steps.reduce((sum, step) => sum + (step.metadata?.durationMs ?? 0), 0)
  return total > 0 ? total : undefined
}

function curvePath(from: GraphNode, to: GraphNode): string {
  const dx = Math.max(8, Math.abs(to.x - from.x) * 0.42)
  const c1x = from.x + (to.x >= from.x ? dx : -dx)
  const c2x = to.x - (to.x >= from.x ? dx : -dx)
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`
}

function isActiveEdge(from: GraphNode, to: GraphNode): boolean {
  return ['active', 'running', 'awaiting_approval'].includes(from.status) || ['active', 'running', 'awaiting_approval'].includes(to.status)
}

function getStepTone(step: AgentRunStep): BadgeTone {
  if (step.toolCall?.status === 'requires_approval') return 'warning'
  if (step.toolCall?.status === 'error' || step.toolCall?.status === 'rejected') return 'danger'
  if (step.type === 'observe' || step.type === 'observation') return 'success'
  if (step.type === 'act' || step.type === 'action') return 'accent'
  return 'neutral'
}

function getStateTone(state: AgentUiState): BadgeTone {
  if (state === 'awaiting_approval') return 'warning'
  if (state === 'running' || state === 'planning' || state === 'starting') return 'accent'
  if (state === 'done') return 'success'
  if (state === 'blocked' || state === 'error') return 'danger'
  return 'neutral'
}

function getNodeTone(status: GraphNodeStatus): BadgeTone {
  if (status === 'awaiting_approval') return 'warning'
  if (status === 'active' || status === 'running') return 'accent'
  if (status === 'done') return 'success'
  if (status === 'blocked' || status === 'error') return 'danger'
  if (status === 'critical') return 'critical'
  return 'neutral'
}

function scoreRisk(score: number): string {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

function formatState(state: string): string {
  return state
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

function trim(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 3)}...`
}
