import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  BrainCog,
  Check,
  ClipboardCheck,
  Code2,
  Copy,
  Crosshair,
  Eye,
  FileText,
  FlaskConical,
  FolderCode,
  Globe,
  History,
  Mic,
  Minus,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AgentRunStep, AgentState } from '@shared/types/agent.types'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import { useApproval } from '../hooks/use-approval'
import { extractReport, isNetstatText } from '../lib/report'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Tabs, type TabItem } from '../components/ui/Tabs'
import { ExpandableText, SocketsView, StepContent, StructuredReport } from '../components/reports/StructuredReport'

type AgentUiState = AgentState | 'starting'
type BottomTab = 'console' | 'observations' | 'audit' | 'report'
type DotTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
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
  caption: string
  x: number
  y: number
  icon: LucideIcon
  status: GraphNodeStatus
  runId?: string
  tool?: string
  target?: string
  durationMs?: number
  expire?: string
  riskScore: number
  riskLevel?: RiskLevel
  toolTag?: string
  dotTone: DotTone
  dotLabel: string
  description: string
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

type NodePos = { x: number; y: number }

// The graph is laid out inside a fixed design box, then uniformly scaled to fit
// the canvas — so nodes keep their proportions and never overlap at any width.
const GRAPH_DESIGN = { w: 1180, h: 560 }

// Canvas coordinates in % (node centre). Seeds the draggable layout state.
const DEFAULT_POSITIONS: Record<GraphNodeId, NodePos> = {
  prompt: { x: 10, y: 50 },
  agent: { x: 27, y: 50 },
  reasoning: { x: 45, y: 25 },
  'tool-intent': { x: 61, y: 25 },
  approval: { x: 77, y: 25 },
  sandbox: { x: 61, y: 75 },
  observation: { x: 45, y: 75 },
  risk: { x: 77, y: 75 },
  report: { x: 91, y: 50 },
}

const SAMPLE_STEPS: AgentRunStep[] = [
  {
    id: 'sample-reason',
    type: 'reason',
    content: 'Évaluer la posture locale, puis demander une approbation avant tout scan externe.',
    metadata: { tokensUsed: 212, durationMs: 820, confidenceScore: 0.81 },
    timestamp: Date.now() - 120000,
  },
  {
    id: 'sample-action',
    type: 'act',
    content: 'Préparer une intention de scan réseau sur le /24 cible.',
    toolCall: {
      id: 'sample-tool',
      name: 'nmap',
      args: { target: '10.0.4.0/24', scanType: 'version' },
      status: 'requires_approval',
    },
    metadata: { tokensUsed: 126, durationMs: 540, confidenceScore: 0.74 },
    timestamp: Date.now() - 90000,
  },
  {
    id: 'sample-observe',
    type: 'observe',
    content: "Canal d'observation en attente de la sortie sandbox après approbation humaine.",
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
}: AgentRunsProps): React.ReactElement {
  const { approve, reject } = useApproval()
  const [selectedNodeId, setSelectedNodeId] = useState<GraphNodeId>('approval')
  const [bottomTab, setBottomTab] = useState<BottomTab>('console')
  const [search, setSearch] = useState('')
  const [zoom, setZoom] = useState(1)
  const [contextMenu, setContextMenu] = useState<{ nodeId: GraphNodeId; x: number; y: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<GraphNodeId, NodePos>>(DEFAULT_POSITIONS)
  const [draggingId, setDraggingId] = useState<GraphNodeId | null>(null)
  const [fit, setFit] = useState(1)
  const fitRef = useRef(1)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: GraphNodeId; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  // Auto-scale the graph so its fixed design box always fits the visible canvas.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const compute = (): void => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const next = clamp(
        Math.min((rect.width - 40) / GRAPH_DESIGN.w, (rect.height - 40) / GRAPH_DESIGN.h),
        0.4,
        1.3,
      )
      fitRef.current = next
      setFit(next)
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  const isDemo = steps.length === 0 && !currentRunId
  const displaySteps = isDemo ? SAMPLE_STEPS : steps
  const graphState = isDemo ? 'awaiting_approval' : state
  const nodes = useMemo(
    () =>
      buildGraphNodes({
        prompt,
        currentRunId: currentRunId ?? (isDemo ? 'run_7f3a2' : null),
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
    [node.title, node.caption, node.tool, node.target].join(' ').toLowerCase().includes(search.toLowerCase()),
  )
  const observations = displaySteps.filter(step => step.type === 'observation' || step.type === 'observe')
  const hypotheses = displaySteps.filter(step => step.type === 'thought' || step.type === 'reason')
  const pendingApproval = pendingApprovals[0]
  const consoleLines = buildConsoleLines(displaySteps, isDemo, pendingApproval)
  const parsedReport = useMemo(() => extractReport(displaySteps), [displaySteps])
  const reportJson = {
    demo: isDemo,
    runId: currentRunId,
    state,
    model: modelStatus?.modelName ?? null,
    pendingApprovals: pendingApprovals.length,
    graph: nodes.map(node => ({
      id: node.id,
      title: node.title,
      status: node.status,
      riskScore: node.riskScore,
      tool: node.tool,
      target: node.target,
    })),
  }
  const canDecide = Boolean(pendingApproval) && ['approval', 'tool-intent', 'risk'].includes(selectedNode.id)

  function copy(value: unknown): void {
    void navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    flash('Copié')
  }

  function flash(message: string): void {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 1400)
  }

  function openContextMenu(event: React.MouseEvent, nodeId: GraphNodeId): void {
    event.preventDefault()
    event.stopPropagation()
    setSelectedNodeId(nodeId)
    setContextMenu({ nodeId, x: event.clientX, y: event.clientY })
  }

  function changeZoom(delta: number): void {
    setZoom(current => Math.min(1.6, Math.max(0.6, Math.round((current + delta) * 100) / 100)))
  }

  const posOf = (id: GraphNodeId): NodePos => positions[id] ?? DEFAULT_POSITIONS[id]

  function handleNodePointerDown(event: React.PointerEvent<HTMLButtonElement>, id: GraphNodeId): void {
    if (event.button !== 0) return
    event.stopPropagation()
    const pos = posOf(id)
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, origX: pos.x, origY: pos.y, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedNodeId(id)
    setDraggingId(id)
  }

  function handleNodePointerMove(event: React.PointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    // Positions are % of the fixed design box; convert screen pixels through the
    // current on-screen scale (auto-fit × user zoom).
    const scale = fitRef.current * zoom
    const nextX = clamp(drag.origX + (dx / (GRAPH_DESIGN.w * scale)) * 100, 4, 96)
    const nextY = clamp(drag.origY + (dy / (GRAPH_DESIGN.h * scale)) * 100, 6, 94)
    setPositions(prev => ({ ...prev, [drag.id]: { x: nextX, y: nextY } }))
  }

  function handleNodePointerUp(event: React.PointerEvent<HTMLButtonElement>): void {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
    setDraggingId(null)
  }

  function resetLayout(): void {
    setPositions(DEFAULT_POSITIONS)
    flash('Disposition réinitialisée')
  }

  async function handleApprove(): Promise<void> {
    if (!pendingApproval) return
    await approve(pendingApproval.id)
    flash('Action approuvée')
  }

  async function handleReject(): Promise<void> {
    if (!pendingApproval) return
    await reject(pendingApproval.id)
    flash('Action rejetée')
  }

  return (
    <div className="agent-workspace" onClick={() => setContextMenu(null)}>
      <section className="panel graph-panel" aria-label="Graphe agent NEXUS">
        <div className="graph-chip">
          <Badge tone={isDemo ? 'warning' : 'accent'}>{isDemo ? 'Démo' : 'Live'}</Badge>
          <Badge tone={getStateTone(graphState)}>{formatState(graphState)}</Badge>
        </div>

        <div className="graph-canvas" ref={canvasRef}>
          <div
            className="graph-viewport"
            style={{
              width: GRAPH_DESIGN.w,
              height: GRAPH_DESIGN.h,
              transform: `translate(-50%, -50%) scale(${fit * zoom})`,
            }}
          >
            <svg className="graph-edges" preserveAspectRatio="none" viewBox="0 0 100 100">
              {EDGES.map(([fromId, toId]) => {
                const from = nodes.find(node => node.id === fromId)
                const to = nodes.find(node => node.id === toId)
                if (!from || !to) return null
                const active = isActiveEdge(from, to)
                return (
                  <path
                    className={['graph-edge', active ? 'is-active' : ''].filter(Boolean).join(' ')}
                    d={curvePath(posOf(fromId), posOf(toId))}
                    key={`${fromId}-${toId}`}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </svg>

            <div
              className="graph-ghost"
              style={{ left: 'calc(19% - 55px)', top: 'calc(70% - 22px)' }}
              aria-hidden="true"
            >
              <Eye size={15} />
              <span>
                recon passif
                <br />
                écarté
              </span>
            </div>

            {NODE_ORDER.map(id => {
              const node = nodes.find(item => item.id === id)
              if (!node) return null
              const Icon = node.icon
              const pos = posOf(id)
              return (
                <button
                  className={[
                    'graph-node',
                    selectedNodeId === id ? 'is-selected' : '',
                    draggingId === id ? 'is-dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-status={node.status}
                  key={node.id}
                  style={{ left: `calc(${pos.x}% - 93px)`, top: `calc(${pos.y}% - 54px)` }}
                  type="button"
                  onPointerDown={event => handleNodePointerDown(event, node.id)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={handleNodePointerUp}
                  onContextMenu={event => openContextMenu(event, node.id)}
                >
                  <span className="graph-node-head">
                    <span className="graph-node-icon">
                      <Icon size={16} />
                    </span>
                    <span className="graph-node-title">{node.title}</span>
                    <span
                      className="graph-node-menu"
                      role="presentation"
                      onPointerDown={event => event.stopPropagation()}
                      onClick={event => openContextMenu(event, node.id)}
                    >
                      <MoreHorizontal size={15} />
                    </span>
                  </span>
                  <span className="graph-node-caption">{node.caption}</span>
                  <span className="graph-node-foot">
                    {node.riskLevel && (
                      <span className="risk-chip" data-risk={node.riskLevel}>
                        {node.riskLevel}
                      </span>
                    )}
                    {node.toolTag && <span className="mono muted">{node.toolTag}</span>}
                    {node.dotLabel && (
                      <span className="status-dot" data-tone={node.dotTone}>
                        {node.dotLabel}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="graph-zoom">
            <button aria-label="Dézoomer" type="button" onClick={() => changeZoom(-0.1)}>
              <Minus size={15} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button aria-label="Zoomer" type="button" onClick={() => changeZoom(0.1)}>
              <Plus size={15} />
            </button>
          </div>

          <div className="graph-minimap" aria-hidden="true">
            {nodes.map(node => (
              <span
                className={['graph-minimap-dot', selectedNodeId === node.id ? 'is-selected' : ''].filter(Boolean).join(' ')}
                data-tone={node.dotTone}
                key={node.id}
                style={{ left: `${posOf(node.id).x}%`, top: `${posOf(node.id).y}%` }}
              />
            ))}
            <span className="graph-minimap-frame" />
          </div>
        </div>

        <div className="composer-dock">
          <PromptComposer
            phase={composerPhase(state)}
            prompt={prompt}
            onNotice={flash}
            onPromptChange={onPromptChange}
            onSend={onStart}
            onStop={onStop}
          />
        </div>

        {contextMenu && (
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={event => event.stopPropagation()}
          >
            <button type="button" onClick={() => setSelectedNodeId(contextMenu.nodeId)}>
              <Search size={14} />
              Voir les détails
            </button>
            <button type="button" onClick={() => copy(nodes.find(node => node.id === contextMenu.nodeId)?.json ?? {})}>
              <Copy size={14} />
              Copier le JSON
            </button>
            <button type="button" onClick={() => setBottomTab('audit')}>
              <History size={14} />
              Ouvrir l'audit
            </button>
            <button type="button" onClick={() => setSelectedNodeId('tool-intent')}>
              <Terminal size={14} />
              Inspecter l'intention
            </button>
            <button type="button" onClick={resetLayout}>
              <RefreshCw size={14} />
              Réinitialiser la disposition
            </button>
          </div>
        )}
      </section>

      <aside className="panel inspector-panel">
        <div className="inspector-search">
          <Input
            placeholder="Rechercher nœud, outil…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          {search && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {filteredNodes.slice(0, 6).map(node => (
                <button
                  className="button button--ghost button--sm"
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  {node.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="inspector-body">
          <section className="inspector-section">
            <span className="section-label">Nœud sélectionné</span>
            <div className="inspector-node-head">
              <span className="graph-node-icon" data-node={selectedNode.status}>
                <selectedNode.icon size={17} />
              </span>
              <div className="inspector-node-title">
                <strong>{selectedNode.title}</strong>
                <span>{selectedNode.caption}</span>
              </div>
              {selectedNode.riskLevel ? (
                <span className="risk-chip" data-risk={selectedNode.riskLevel}>
                  {selectedNode.riskLevel}
                </span>
              ) : (
                <Badge tone={getNodeTone(selectedNode.status)}>{statusLabel(selectedNode.status)}</Badge>
              )}
            </div>

            <dl className="kv-grid">
              <dt>runId</dt>
              <dd className="truncate">{selectedNode.runId ?? '—'}</dd>
              <dt>outil</dt>
              <dd>{selectedNode.tool ?? '—'}</dd>
              <dt>cible</dt>
              <dd className="truncate">{selectedNode.target ?? 'workspace local'}</dd>
              <dt>statut</dt>
              <dd className={statusClass(selectedNode.status)}>{statusLabel(selectedNode.status)}</dd>
              <dt>{selectedNode.expire ? 'expire' : 'durée'}</dt>
              <dd className={selectedNode.expire ? 'is-warning' : ''}>
                {selectedNode.expire ?? (selectedNode.durationMs ? `${selectedNode.durationMs} ms` : '—')}
              </dd>
            </dl>
          </section>

          <section className="inspector-section">
            <span className="section-label">Score de risque</span>
            <div className="risk-meter" data-risk={scoreRisk(selectedNode.riskScore)}>
              <span style={{ width: `${selectedNode.riskScore}%` }} />
            </div>
            <p className="inspector-desc">{selectedNode.description}</p>
          </section>

          <section className="inspector-section">
            <div className="toolbar-line">
              <span className="section-label">Intention (JSON)</span>
              <Button size="sm" variant="ghost" onClick={() => copy(selectedNode.json)}>
                <Copy size={13} />
                Copier
              </Button>
            </div>
            <pre className="json-block">{JSON.stringify(selectedNode.json, null, 2)}</pre>
          </section>

          {selectedNode.recommendations.length > 0 && (
            <section className="inspector-section">
              <span className="section-label">Recommandations</span>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }} className="muted">
                {selectedNode.recommendations.map(item => (
                  <li key={item} style={{ fontSize: 12.5 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="inspector-foot">
          {canDecide ? (
            <>
              <Button variant="success" onClick={() => void handleApprove()}>
                <Check size={15} />
                Approuver
              </Button>
              <Button variant="danger" onClick={() => void handleReject()}>
                <X size={15} />
                Rejeter
              </Button>
            </>
          ) : (
            <>
              <Button variant="subtle" onClick={() => copy(selectedNode.json)}>
                <Copy size={14} />
                Copier le JSON
              </Button>
              <Button variant="ghost" onClick={() => setBottomTab('audit')}>
                <History size={14} />
                Audit
              </Button>
            </>
          )}
        </div>
      </aside>

      <section className="panel bottom-panel">
        <div className="panel-header">
          <Tabs active={bottomTab} tabs={BOTTOM_TABS} onChange={id => setBottomTab(id as BottomTab)} />
          <Button size="sm" variant="ghost" onClick={() => copy(bottomTab === 'report' ? reportJson : consoleLines)}>
            <Copy size={13} />
            Copy
          </Button>
        </div>
        <div className="bottom-content">
          {bottomTab === 'console' && <ConsolePanel error={error} lines={consoleLines} />}
          {bottomTab === 'observations' && <ObservationsPanel hypotheses={hypotheses} observations={observations} />}
          {bottomTab === 'audit' && (
            <AuditPanel pendingApprovals={pendingApprovals} recentApprovals={recentApprovals} steps={displaySteps} />
          )}
          {bottomTab === 'report' && <ReportPanel report={parsedReport} fallback={reportJson} />}
        </div>
      </section>

      {notice && (
        <div className="toast-region">
          <div className="toast">
            <strong>{notice}</strong>
          </div>
        </div>
      )}
    </div>
  )
}

type ComposerMode = 'search' | 'think' | 'canvas' | null
type ComposerPhase = 'ready' | 'thinking' | 'generating'
type AttachKind = 'IMG' | 'PDF' | 'CSV' | 'XLSX' | 'CTX' | 'FILE'

interface Attachment {
  id: string
  name: string
  kind: AttachKind
  size: number
  url?: string
}

function composerPhase(state: AgentUiState): ComposerPhase {
  if (state === 'running' || state === 'starting') return 'generating'
  if (state === 'planning' || state === 'awaiting_approval') return 'thinking'
  return 'ready'
}

function attachmentKind(file: File): AttachKind {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return 'IMG'
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'PDF'
  if (name.endsWith('.csv')) return 'CSV'
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'XLSX'
  return 'FILE'
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

/**
 * Premium prompt composer — a self-contained capsule reused across surfaces.
 * Emits intents only (onSend / onStop); it does not know the backend.
 * Inspired by the Opti-Power ChatInput: attachment previews, auto-grow textarea,
 * state-driven aura, and a send button that becomes Stop while generating.
 */
function PromptComposer({
  prompt,
  onPromptChange,
  onSend,
  onStop,
  onNotice,
  phase,
}: {
  prompt: string
  onPromptChange(value: string): void
  onSend(): void
  onStop(): void
  onNotice(message: string): void
  phase: ComposerPhase
}): React.ReactElement {
  const [mode, setMode] = useState<ComposerMode>(null)
  const [canvas, setCanvas] = useState(false)
  const [files, setFiles] = useState<Attachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const busy = phase === 'generating' || phase === 'thinking'
  const hasContent = prompt.trim().length > 0 || files.length > 0

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [prompt])

  const placeholder =
    mode === 'search'
      ? 'Rechercher sur le web…'
      : mode === 'think'
        ? 'Raisonner en profondeur…'
        : canvas
          ? 'Composer sur le canvas…'
          : 'Décrire une mission défensive — hôte, périmètre, objectif…'

  function toggleMode(next: Exclude<ComposerMode, null>): void {
    setMode(current => (current === next ? null : next))
  }

  function addFiles(list: FileList): void {
    const incoming: Attachment[] = Array.from(list).map(file => {
      const kind = attachmentKind(file)
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        kind,
        size: file.size,
        url: kind === 'IMG' ? URL.createObjectURL(file) : undefined,
      }
    })
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name))
      return [...prev, ...incoming.filter(f => !seen.has(f.name))]
    })
  }

  function captureContext(): void {
    setFiles(prev =>
      prev.some(f => f.kind === 'CTX')
        ? prev
        : [...prev, { id: `ctx-${Date.now()}`, name: 'Contexte du run courant', kind: 'CTX', size: 0 }],
    )
    onNotice('Contexte capturé')
  }

  function removeFile(id: string): void {
    setFiles(prev => {
      const target = prev.find(f => f.id === id)
      if (target?.url) URL.revokeObjectURL(target.url)
      return prev.filter(f => f.id !== id)
    })
  }

  function submit(): void {
    if (!hasContent) return
    onSend()
    files.forEach(f => f.url && URL.revokeObjectURL(f.url))
    setFiles([])
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer" data-mode={mode ?? undefined} data-phase={phase}>
      {files.length > 0 && (
        <div className="composer-attachments">
          {files.map(file => (
            <div className="composer-attach" data-kind={file.kind} key={file.id}>
              {file.url ? (
                <img alt={file.name} src={file.url} />
              ) : (
                <span className="composer-attach-badge">{file.kind}</span>
              )}
              <span className="composer-attach-meta">
                <strong className="truncate">{file.name}</strong>
                <span>{file.kind === 'CTX' ? 'dashboard' : formatBytes(file.size)}</span>
              </span>
              <button
                aria-label={`Retirer ${file.name}`}
                className="composer-attach-remove"
                type="button"
                onClick={() => removeFile(file.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="composer-input">
        <Terminal size={17} />
        <textarea
          ref={textareaRef}
          aria-label="Prompt agent"
          placeholder={placeholder}
          rows={1}
          value={prompt}
          onChange={event => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="composer-actions">
        <div className="composer-tools">
          <button
            aria-label="Joindre un fichier"
            className="composer-tool icon-only"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={17} />
          </button>
          <input
            ref={fileInputRef}
            accept="image/*,.pdf,.csv,.xlsx,.xls,.txt,.log,.json,.pcap"
            hidden
            multiple
            type="file"
            onChange={event => {
              if (event.target.files?.length) addFiles(event.target.files)
              event.target.value = ''
            }}
          />

          <button
            aria-label="Capturer le contexte du run"
            className="composer-tool icon-only"
            type="button"
            onClick={captureContext}
          >
            <Crosshair size={16} />
          </button>

          <span className="composer-divider" />

          <button
            aria-pressed={mode === 'search'}
            className="composer-tool"
            data-accent="search"
            data-active={mode === 'search'}
            type="button"
            onClick={() => toggleMode('search')}
          >
            <Globe size={16} />
            {mode === 'search' && <span>Recherche</span>}
          </button>

          <button
            aria-pressed={mode === 'think'}
            className="composer-tool"
            data-accent="think"
            data-active={mode === 'think'}
            type="button"
            onClick={() => toggleMode('think')}
          >
            <BrainCog size={16} />
            {mode === 'think' && <span>Raisonnement</span>}
          </button>

          <button
            aria-pressed={canvas}
            className="composer-tool"
            data-accent="canvas"
            data-active={canvas}
            type="button"
            onClick={() => setCanvas(current => !current)}
          >
            <FolderCode size={16} />
            {canvas && <span>Canvas</span>}
          </button>
        </div>

        {busy ? (
          <button
            aria-label="Arrêter la génération"
            className="composer-send composer-send--stop"
            type="button"
            onClick={onStop}
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            aria-label={hasContent ? 'Lancer la mission' : 'Message vocal'}
            className="composer-send"
            data-ready={hasContent}
            type="button"
            onClick={() => (hasContent ? submit() : onNotice('Saisie vocale bientôt disponible'))}
          >
            {hasContent ? <ArrowUp size={18} /> : <Mic size={17} />}
          </button>
        )}
      </div>
    </div>
  )
}

interface ConsoleLine {
  id: string
  time: string
  tag: string
  tone: string
  text: string
}

function ConsolePanel({ lines, error }: { lines: ConsoleLine[]; error: string | null }): React.ReactElement {
  if (lines.length === 0 && !error) {
    return (
      <div className="empty-state">
        <Terminal size={24} />
        <strong>Aucun évènement console</strong>
      </div>
    )
  }
  return (
    <div className="console-stream">
      {error && (
        <div className="console-line">
          <span className="console-time">--:--:--</span>
          <span className="console-tag" data-tone="danger">
            error
          </span>
          <span className="console-text">{error}</span>
        </div>
      )}
      {lines.map(line => (
        <div className="console-line" key={line.id}>
          <span className="console-time">{line.time}</span>
          <span className="console-tag" data-tone={line.tone}>
            {line.tag}
          </span>
          <span className="console-text">{highlightNumbers(line.text)}</span>
        </div>
      ))}
    </div>
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
      <section style={{ gridColumn: 'span 7' }} className="stack-4">
        <span className="section-label">
          <FlaskConical size={13} /> Observations
        </span>
        {observations.length === 0 ? (
          <p className="muted">Aucune observation sandbox.</p>
        ) : (
          observations.map(step => {
            const text = step.observation ?? step.content
            return (
              <div className="observation-card" key={step.id ?? `${step.type}-${step.timestamp}`}>
                {isNetstatText(text) ? <SocketsView text={text} limit={20} /> : <ExpandableText text={text} />}
              </div>
            )
          })
        )}
      </section>
      <section style={{ gridColumn: 'span 5' }} className="stack-4">
        <span className="section-label">
          <Sparkles size={13} /> Hypothèses
        </span>
        {hypotheses.length === 0 ? (
          <p className="muted">Aucune étape de raisonnement.</p>
        ) : (
          hypotheses.map(step => (
            <div className="observation-card" key={step.id ?? `${step.type}-${step.timestamp}`}>
              <ExpandableText text={step.content} clamp={3} />
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function ReportPanel({
  report,
  fallback,
}: {
  report: ReturnType<typeof extractReport>
  fallback: unknown
}): React.ReactElement {
  if (!report) {
    return <pre className="json-block">{JSON.stringify(fallback, null, 2)}</pre>
  }
  return (
    <div className="stack-4">
      <StructuredReport report={report} />
      <details className="disclosure">
        <summary>
          <Code2 size={14} />
          JSON brut
        </summary>
        <pre className="json-block">{JSON.stringify(report, null, 2)}</pre>
      </details>
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
  const auditSteps = [...steps].filter(step => step.toolCall || step.type === 'observation' || step.type === 'observe')
  if (approvals.length === 0 && auditSteps.length === 0) {
    return (
      <div className="empty-state">
        <History size={24} />
        <strong>Aucun évènement d'audit</strong>
      </div>
    )
  }
  return (
    <ol className="timeline">
      {approvals.map(item => (
        <li className="timeline-item" data-tone={item.status === 'approved' ? 'success' : item.status === 'pending' ? 'warning' : 'danger'} key={item.id}>
          <div className="timeline-marker" />
          <div className="timeline-body">
            <div className="timeline-head">
              <Badge tone={item.status === 'pending' ? 'warning' : item.status === 'approved' ? 'success' : 'danger'}>
                {item.status}
              </Badge>
              <span className="mono">{item.intentKind}</span>
              <time className="mono muted">{item.createdAt}</time>
            </div>
            <p className="muted">{item.summary}</p>
          </div>
        </li>
      ))}
      {auditSteps.reverse().map(step => (
        <li className="timeline-item" data-tone={getStepTone(step)} key={step.id ?? `${step.type}-${step.timestamp}`}>
          <div className="timeline-marker" />
          <div className="timeline-body">
            <div className="timeline-head">
              <Badge tone={getStepTone(step)}>{step.toolCall?.name ?? step.type}</Badge>
              {step.toolCall?.status && <span className="mono muted">{step.toolCall.status}</span>}
              <time className="mono muted">{formatClock(step.timestamp)}</time>
            </div>
            <StepContent content={step.content} />
          </div>
        </li>
      ))}
    </ol>
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
  const tool = latestAction?.toolCall?.name ?? latestApproval?.intentKind ?? (input.isDemo ? 'nmap' : undefined)
  const target = inferTarget(latestAction) ?? latestApproval?.summary ?? (input.isDemo ? '10.0.4.0/24' : undefined)
  const command = tool && target ? `${tool} -sV ${target}` : tool ?? 'aucun outil'
  const riskScore = riskScoreFrom(input.pendingApprovals, input.steps, input.isDemo)
  const riskLevel = scoreRisk(riskScore) as RiskLevel
  const intentTag = latestApproval?.intentKind ?? (input.isDemo ? 'network.scan' : tool)
  const expire = input.isDemo ? '04:52' : approvalExpire(pendingApproval)
  const model = input.modelStatus?.modelName ?? (input.isDemo ? 'qwen2.5-7b' : 'modèle local')
  const approvalStatus: GraphNodeStatus = pendingApproval
    ? 'awaiting_approval'
    : latestApproval?.status === 'approved'
      ? 'done'
      : latestApproval?.status === 'rejected'
        ? 'blocked'
        : input.isDemo
          ? 'awaiting_approval'
          : 'pending'
  const sandboxStatus: GraphNodeStatus =
    latestAction?.toolCall?.status === 'running'
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
      caption: `"${trim(input.prompt, 30)}"`,
      x: 10,
      y: 50,
      icon: MessageSquareText,
      status: input.currentRunId ? 'done' : 'pending',
      runId: input.currentRunId ?? undefined,
      riskScore: 8,
      dotTone: 'accent',
      dotLabel: 'reçu · t0',
      description: 'Mission fournie par l’opérateur. Périmètre explicite, diagnostics locaux privilégiés.',
      recommendations: ['Garder le périmètre explicite', 'Commencer par des diagnostics locaux'],
      history,
      json: { prompt: trim(input.prompt, 160), demo: input.isDemo },
    },
    {
      id: 'agent',
      title: 'NEXUS Agent',
      caption: `react · ${model}`,
      x: 27,
      y: 50,
      icon: Bot,
      status: agentNodeStatus(input.state),
      runId: input.currentRunId ?? undefined,
      durationMs: duration(input.steps),
      riskScore: 18,
      dotTone: input.state === 'awaiting_approval' ? 'warning' : 'accent',
      dotLabel: input.state === 'awaiting_approval' ? 'raisonnement…' : formatState(input.state).toLowerCase(),
      description: 'Boucle ReAct : ancre les décisions dans les observations et escalade les actions sensibles.',
      recommendations: ['Ancrer les décisions dans les observations', 'Escalader les actions sensibles'],
      history,
      json: { runId: input.currentRunId, state: input.state, model },
    },
    {
      id: 'reasoning',
      title: 'Reasoning',
      caption: latestReason ? `plan · ${trim(latestReason.content, 22)}` : 'plan · découverte→scan',
      x: 45,
      y: 25,
      icon: Sparkles,
      status: latestReason ? 'done' : input.state === 'running' ? 'active' : input.isDemo ? 'done' : 'pending',
      runId: input.currentRunId ?? undefined,
      durationMs: latestReason?.metadata?.durationMs,
      riskScore: 22,
      dotTone: 'success',
      dotLabel: 'ok',
      description: 'Plan de découverte séparé des observations : host-discovery, port-scan, service-fingerprint.',
      recommendations: ['Garder les hypothèses distinctes des observations'],
      history: latestReason ? [latestReason.content, ...history] : history,
      json: latestReason ? { ...latestReason } : { plan: ['host-discovery', 'port-scan', 'service-fingerprint'] },
    },
    {
      id: 'tool-intent',
      title: 'Tool Intent',
      caption: command,
      x: 61,
      y: 25,
      icon: Code2,
      status: latestAction ? toolStatus(latestAction) : input.isDemo ? 'awaiting_approval' : 'pending',
      runId: input.currentRunId ?? undefined,
      tool,
      target,
      durationMs: latestAction?.metadata?.durationMs,
      riskScore: Math.max(30, riskScore),
      riskLevel,
      toolTag: intentTag,
      dotTone: 'warning',
      dotLabel: '',
      description: 'Intention d’outil rendue avant exécution. Route obligatoire par la sandbox.',
      recommendations: ['Rendre l’intention avant exécution', 'Router uniquement via la sandbox'],
      history: latestAction ? [latestAction.content, ...history] : history,
      json: { tool, cmd: command, risk: riskLevel.toUpperCase(), requiresApproval: true },
    },
    {
      id: 'approval',
      title: 'Approval',
      caption: expire ? `humaine · expire ${expire}` : pendingApproval ? 'humaine · requise' : 'aucune requise',
      x: 77,
      y: 25,
      icon: ClipboardCheck,
      status: approvalStatus,
      runId: latestApproval?.runId ?? input.currentRunId ?? undefined,
      tool: intentTag,
      target,
      expire: approvalStatus === 'awaiting_approval' ? expire : undefined,
      riskScore,
      riskLevel,
      dotTone: approvalStatus === 'awaiting_approval' ? 'warning' : approvalStatus === 'done' ? 'success' : 'neutral',
      dotLabel:
        approvalStatus === 'awaiting_approval'
          ? 'en attente'
          : approvalStatus === 'done'
            ? 'approuvé'
            : approvalStatus === 'blocked'
              ? 'rejeté'
              : 'aucune',
      description: 'Scan actif sur un /24 — impact réseau modéré, non destructif, réversible.',
      recommendations: pendingApproval
        ? ['Vérifier la cible et le périmètre', 'Rejeter les actions ambiguës ou externes']
        : ['Les actions sensibles restent verrouillées'],
      history: latestApproval ? [latestApproval.reason, ...history] : history,
      json: { tool: intentTag, cmd: command, risk: riskLevel.toUpperCase(), requiresApproval: true },
    },
    {
      id: 'sandbox',
      title: 'Sandbox Exec',
      caption: 'isolé · net-ns · ro-fs',
      x: 61,
      y: 75,
      icon: Terminal,
      status: sandboxStatus,
      runId: input.currentRunId ?? undefined,
      tool,
      target,
      durationMs: latestAction?.metadata?.durationMs,
      riskScore: Math.max(35, riskScore),
      dotTone: sandboxStatus === 'running' ? 'accent' : sandboxStatus === 'done' ? 'success' : 'neutral',
      dotLabel: sandboxStatus === 'pending' ? 'en file' : sandboxStatus === 'running' ? 'exécution' : 'terminé',
      description: 'Exécuteur isolé : namespace réseau dédié, système de fichiers en lecture seule, sortie bornée.',
      recommendations: ['Borner la sortie et le timeout', 'IPC allowlisté uniquement'],
      history,
      json: { status: sandboxStatus, isolation: ['net-ns', 'ro-fs', 'seccomp'], tool, target },
    },
    {
      id: 'observation',
      title: 'Observation',
      caption: latestObservation ? trim(latestObservation.observation ?? latestObservation.content, 24) : '— hôtes · — ports',
      x: 45,
      y: 75,
      icon: FlaskConical,
      status: latestObservation ? 'done' : 'pending',
      runId: input.currentRunId ?? undefined,
      durationMs: latestObservation?.metadata?.durationMs,
      riskScore: 24,
      dotTone: latestObservation ? 'success' : 'neutral',
      dotLabel: latestObservation ? 'ok' : 'pending',
      description: 'N’enregistre que la sortie observée de la sandbox, jamais une hypothèse.',
      recommendations: ['N’enregistrer que la sortie observée'],
      history: latestObservation ? [latestObservation.content, ...history] : history,
      json: latestObservation ? { ...latestObservation } : { hosts: null, ports: null, status: 'pending' },
    },
    {
      id: 'risk',
      title: 'Risk Finding',
      caption: riskScore >= 70 ? 'finding prioritaire' : riskScore >= 40 ? 'revue recommandée' : 'en attente',
      x: 77,
      y: 75,
      icon: riskScore >= 80 ? ShieldAlert : AlertTriangle,
      status: riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'blocked' : 'pending',
      runId: input.currentRunId ?? undefined,
      tool,
      target,
      riskScore,
      dotTone: 'neutral',
      dotLabel: 'pending',
      description: 'Classe les findings par preuve. Ne promeut jamais une hypothèse en finding.',
      recommendations: ['Classer par preuve', 'Ne pas promouvoir les hypothèses'],
      history,
      json: { score: riskScore, level: riskLevel.toUpperCase(), approvals: input.pendingApprovals.length },
    },
    {
      id: 'report',
      title: 'Final Report',
      caption: 'report.json',
      x: 91,
      y: 50,
      icon: FileText,
      status: reportStatus,
      runId: input.currentRunId ?? undefined,
      durationMs: duration(input.steps),
      riskScore,
      dotTone: reportStatus === 'done' ? 'success' : 'neutral',
      dotLabel: reportStatus === 'done' ? 'prêt' : 'pending',
      description: 'Synthèse : preuves, approbations et risque résiduel.',
      recommendations: ['Résumer preuves, approbations et risque résiduel'],
      history,
      json: { status: reportStatus, runId: input.currentRunId, steps: input.steps.length, error: input.error },
    },
  ]
}

function buildConsoleLines(
  steps: AgentRunStep[],
  isDemo: boolean,
  pendingApproval: ApprovalRequestView | undefined,
): ConsoleLine[] {
  if (isDemo) {
    return [
      { id: 'd1', time: '12:41:07', tag: 'agent', tone: 'accent', text: 'plan: host-discovery → port-scan → service-fingerprint' },
      { id: 'd2', time: '12:41:08', tag: 'intent', tone: 'info', text: 'network.scan · nmap -sV 10.0.4.0/24 (risk=MEDIUM)' },
      { id: 'd3', time: '12:41:08', tag: 'policy', tone: 'warning', text: 'requires_approval — scan actif sur /24' },
      { id: 'd4', time: '12:41:08', tag: 'await', tone: 'warning', text: 'approbation humaine requise… expire 04:52' },
    ]
  }
  const lines = steps.map((step, index) => ({
    id: step.id ?? `line-${index}`,
    time: formatClock(step.timestamp),
    tag: consoleTag(step),
    tone: consoleTone(step),
    text: step.toolCall ? `${step.toolCall.name} · ${trim(step.content, 120)}` : trim(step.content, 140),
  }))
  if (pendingApproval) {
    lines.push({
      id: `await-${pendingApproval.id}`,
      time: formatClock(Date.now()),
      tag: 'await',
      tone: 'warning',
      text: `approbation requise — ${pendingApproval.intentKind} (risk=${(pendingApproval.risk ?? 'high').toUpperCase()})`,
    })
  }
  return lines
}

function highlightNumbers(text: string): React.ReactNode {
  const parts = text.split(/(\b[\d]+(?:[.:/][\d]+)*\b)/g)
  return parts.map((part, index) =>
    /^\d/.test(part) ? (
      <span className="num" key={index}>
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

function consoleTag(step: AgentRunStep): string {
  if (step.toolCall?.status === 'requires_approval') return 'await'
  if (step.type === 'act' || step.type === 'action') return 'intent'
  if (step.type === 'observe' || step.type === 'observation') return 'observe'
  if (step.type === 'reason' || step.type === 'thought') return 'agent'
  return step.type
}

function consoleTone(step: AgentRunStep): string {
  if (step.toolCall?.status === 'error' || step.toolCall?.status === 'rejected') return 'danger'
  if (step.toolCall?.status === 'requires_approval') return 'warning'
  if (step.type === 'act' || step.type === 'action') return 'info'
  if (step.type === 'observe' || step.type === 'observation') return 'success'
  if (step.type === 'reason' || step.type === 'thought') return 'accent'
  return 'muted'
}

function approvalExpire(approval: ApprovalRequestView | undefined): string | undefined {
  if (!approval?.expiresAt) return undefined
  const remaining = Math.max(0, Math.round((new Date(approval.expiresAt).getTime() - Date.now()) / 1000))
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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

function riskScoreFrom(approvals: ApprovalRequestView[], steps: AgentRunStep[], isDemo: boolean): number {
  const riskRank: Record<string, number> = { low: 18, medium: 52, high: 68, critical: 92 }
  const approvalScore = approvals.reduce((score, item) => Math.max(score, riskRank[item.risk ?? 'high'] ?? 68), 0)
  const content = steps
    .map(step => `${step.content} ${step.observation ?? ''}`)
    .join(' ')
    .toLowerCase()
  const contentScore =
    content.includes('critical') || content.includes('cve')
      ? 80
      : content.includes('external') || content.includes('denied')
        ? 62
        : content.includes('warning')
          ? 45
          : 20
  const base = Math.max(approvalScore, contentScore)
  return isDemo ? Math.max(base, 52) : base
}

function duration(steps: AgentRunStep[]): number | undefined {
  const total = steps.reduce((sum, step) => sum + (step.metadata?.durationMs ?? 0), 0)
  return total > 0 ? total : undefined
}

function curvePath(from: NodePos, to: NodePos): string {
  const dx = Math.max(8, Math.abs(to.x - from.x) * 0.42)
  const c1x = from.x + (to.x >= from.x ? dx : -dx)
  const c2x = to.x - (to.x >= from.x ? dx : -dx)
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isActiveEdge(from: GraphNode, to: GraphNode): boolean {
  const live: GraphNodeStatus[] = ['active', 'running', 'awaiting_approval', 'done']
  return live.includes(from.status) && live.includes(to.status)
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

function statusClass(status: GraphNodeStatus): string {
  if (status === 'awaiting_approval') return 'is-warning'
  if (status === 'active' || status === 'running') return 'is-accent'
  if (status === 'done') return 'is-success'
  if (status === 'blocked' || status === 'error' || status === 'critical') return 'is-danger'
  return ''
}

const STATUS_LABEL: Record<GraphNodeStatus, string> = {
  pending: 'en attente',
  active: 'actif',
  running: 'exécution',
  awaiting_approval: 'awaiting',
  blocked: 'bloqué',
  error: 'erreur',
  done: 'terminé',
  critical: 'critique',
}

function statusLabel(status: GraphNodeStatus): string {
  return STATUS_LABEL[status] ?? status
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

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('fr-FR', { hour12: false })
}

function trim(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}
