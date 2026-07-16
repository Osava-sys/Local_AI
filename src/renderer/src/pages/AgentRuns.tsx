import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  BrainCog,
  CircleHelp,
  Code2,
  Copy,
  Crosshair,
  FileDown,
  FlaskConical,
  FolderCode,
  Globe,
  History,
  Mic,
  Paperclip,
  Sparkles,
  Square,
  Terminal,
  X,
} from 'lucide-react'
import type { AgentRunStep, AgentState } from '@shared/types/agent.types'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import type {
  ExecutionGraphFilter,
  ExecutionGraphNode,
  ExecutionGraphSelection,
} from '@shared/types/execution-graph.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import { useApproval } from '../hooks/use-approval'
import { buildExecutionGraph, projectExecutionGraph } from '../lib/execution-graph'
import { extractReport } from '../lib/report'
import { downloadReportWord } from '../lib/report-export'
import type {
  AgentPreferences,
  ComposerDefaultMode,
  PromptSubmission,
} from '../lib/mission-preferences'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Tabs, type TabItem } from '../components/ui/Tabs'
import {
  ExecutionGraphCanvas,
  type ExecutionGraphViewMode,
} from '../components/agent/ExecutionGraphCanvas'
import { ExecutionGraphInspector } from '../components/agent/ExecutionGraphInspector'
import { ObservationView } from '../components/agent/ObservationView'
import {
  ExpandableText,
  StepContent,
  StructuredReport,
} from '../components/reports/StructuredReport'

type AgentUiState = AgentState | 'starting'
type BottomTab = 'console' | 'observations' | 'audit' | 'report'

interface AgentRunsProps {
  prompt: string
  currentRunId: string | null
  state: AgentUiState
  steps: AgentRunStep[]
  error: string | null
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: ApprovalRequestView[]
  recentApprovals: ApprovalRequestView[]
  preferences: AgentPreferences
  onPromptChange(prompt: string): void
  onStart(submission?: PromptSubmission): void
  onStop(): void
}

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
  preferences,
  onPromptChange,
  onStart,
  onStop,
}: AgentRunsProps): React.ReactElement {
  const { approve, reject } = useApproval()
  const isDemo = steps.length === 0 && !currentRunId && state === 'idle'
  const displaySteps = isDemo ? SAMPLE_STEPS : steps
  const graphState = isDemo ? 'awaiting_approval' : state
  const [selection, setSelection] = useState<ExecutionGraphSelection>({
    type: 'node',
    id: 'mission:agent',
  })
  const [bottomTab, setBottomTab] = useState<BottomTab>('console')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<ExecutionGraphFilter>('all')
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(() => new Set())
  const [visibleStepCount, setVisibleStepCount] = useState(displaySteps.length)
  const [isFollowingLive, setIsFollowingLive] = useState(true)

  useEffect(() => {
    if (isFollowingLive) setVisibleStepCount(displaySteps.length)
    else setVisibleStepCount((current) => Math.min(current, displaySteps.length))
  }, [displaySteps.length, isFollowingLive])

  useEffect(() => {
    setIsFollowingLive(true)
    setVisibleStepCount(displaySteps.length)
    setSelection({ type: 'node', id: 'mission:agent' })
    setFilter('all')
    setCollapsedBlockIds(new Set())
  }, [currentRunId])

  const visibleSteps = useMemo(
    () => displaySteps.slice(0, Math.min(visibleStepCount, displaySteps.length)),
    [displaySteps, visibleStepCount]
  )
  const executionGraph = useMemo(
    () =>
      buildExecutionGraph({
        prompt,
        currentRunId: currentRunId ?? (isDemo ? 'run_7f3a2' : null),
        state: graphState,
        steps: visibleSteps,
        totalStepCount: displaySteps.length,
        error,
        modelStatus,
        pendingApprovals,
        recentApprovals,
        isDemo,
      }),
    [
      currentRunId,
      displaySteps.length,
      error,
      graphState,
      isDemo,
      modelStatus,
      pendingApprovals,
      prompt,
      recentApprovals,
      visibleSteps,
    ]
  )
  const graph = useMemo(
    () => projectExecutionGraph(executionGraph, filter, collapsedBlockIds),
    [collapsedBlockIds, executionGraph, filter]
  )
  // "Blocs" is not a mode to remember, it is the name for "everything is folded". Deriving it
  // keeps the toolbar honest when a single block is folded or unfolded on its own.
  const viewMode: ExecutionGraphViewMode =
    executionGraph.blocks.length > 0 &&
    executionGraph.blocks.every((block) => collapsedBlockIds.has(block.id))
      ? 'blocks'
      : 'trace'
  const selectedNode =
    selection.type === 'node' ? graph.nodes.find((node) => node.id === selection.id) : undefined
  const observations = displaySteps.filter(
    (step) => step.type === 'observation' || step.type === 'observe'
  )
  const hypotheses = displaySteps.filter(
    (step) => step.type === 'thought' || step.type === 'reason'
  )
  const pendingApproval = pendingApprovals[0]
  const consoleLines = buildConsoleLines(displaySteps, isDemo, pendingApproval)
  const parsedReport = useMemo(() => extractReport(displaySteps), [displaySteps])
  const reportJson = {
    demo: isDemo,
    runId: currentRunId,
    state,
    model: modelStatus?.modelName ?? null,
    pendingApprovals: pendingApprovals.length,
    graph: executionGraph,
  }
  const canDecide = Boolean(
    pendingApproval &&
    selectedNode &&
    ['approval', 'tool', 'policy', 'finding'].includes(selectedNode.kind) &&
    selectedNode.status !== 'blocked'
  )
  const composerContextSummary = buildComposerContextSummary({
    currentRunId,
    state,
    selectedNode,
    observations,
  })

  useEffect(() => {
    const selectionExists =
      (selection.type === 'node' && graph.nodes.some((node) => node.id === selection.id)) ||
      (selection.type === 'edge' && graph.edges.some((edge) => edge.id === selection.id)) ||
      (selection.type === 'block' &&
        executionGraph.blocks.some((block) => block.id === selection.id))
    if (selectionExists) return
    const next =
      graph.nodes.find((node) =>
        ['active', 'running', 'awaiting_approval', 'error', 'blocked'].includes(node.status)
      ) ?? graph.nodes[0]
    if (next) setSelection({ type: 'node', id: next.id })
  }, [executionGraph.blocks, graph.edges, graph.nodes, selection])

  function copy(value: unknown): void {
    void navigator.clipboard.writeText(
      typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    )
    flash('Copié')
  }

  function flash(message: string): void {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 1400)
  }

  function handleSelectionChange(next: ExecutionGraphSelection): void {
    if (next.type === 'node') {
      const sourceNode = executionGraph.nodes.find((node) => node.id === next.id)
      if (sourceNode && !graph.nodes.some((node) => node.id === next.id)) {
        setFilter('all')
        setCollapsedBlockIds((current) => {
          const updated = new Set(current)
          updated.delete(sourceNode.blockId)
          return updated
        })
      }
    }
    setSelection(next)
  }

  function handleViewModeChange(next: ExecutionGraphViewMode): void {
    setCollapsedBlockIds(
      next === 'blocks' ? new Set(executionGraph.blocks.map((block) => block.id)) : new Set()
    )
  }

  function handleBlockToggle(blockId: string): void {
    setCollapsedBlockIds((current) => {
      const next = new Set(current)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
  }

  function handleReplayChange(stepCount: number): void {
    const next = Math.min(displaySteps.length, Math.max(0, stepCount))
    setVisibleStepCount(next)
    setIsFollowingLive(next === displaySteps.length)
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
    <div className="agent-workspace">
      <section className="panel graph-panel" aria-label="Graphe agent NEXUS">
        <ExecutionGraphCanvas
          collapsedBlockIds={collapsedBlockIds}
          filter={filter}
          graph={graph}
          isFollowingLive={isFollowingLive}
          selection={selection}
          totalStepCount={displaySteps.length}
          viewMode={viewMode}
          visibleStepCount={visibleSteps.length}
          statusContent={
            <>
              <Badge tone={isDemo ? 'warning' : 'accent'}>{isDemo ? 'Démo' : 'Live'}</Badge>
              <Badge tone={getStateTone(graphState)}>{formatState(graphState)}</Badge>
              <Badge tone="neutral">{executionGraph.nodes.length} nœuds</Badge>
            </>
          }
          onBlockToggle={handleBlockToggle}
          onFilterChange={setFilter}
          onNotice={flash}
          onReplayChange={handleReplayChange}
          onReturnToLive={() => {
            setVisibleStepCount(displaySteps.length)
            setIsFollowingLive(true)
          }}
          onSelectionChange={handleSelectionChange}
          onViewModeChange={handleViewModeChange}
        />

        <div className="composer-dock">
          <PromptComposer
            key={`${preferences.composerDefaultMode}:${preferences.captureContextByDefault}`}
            captureContextByDefault={preferences.captureContextByDefault}
            contextSummary={composerContextSummary}
            defaultMode={preferences.composerDefaultMode}
            phase={composerPhase(state)}
            prompt={prompt}
            onNotice={flash}
            onPromptChange={onPromptChange}
            onSend={onStart}
            onStop={onStop}
          />
        </div>
      </section>

      <ExecutionGraphInspector
        canDecide={canDecide}
        graph={graph}
        search={search}
        selection={selection}
        sourceGraph={executionGraph}
        onApprove={() => void handleApprove()}
        onCopy={copy}
        onExpandBlock={(blockId) => {
          if (collapsedBlockIds.has(blockId)) handleBlockToggle(blockId)
        }}
        onOpenAudit={() => setBottomTab('audit')}
        onReject={() => void handleReject()}
        onReplayTo={handleReplayChange}
        onSearchChange={setSearch}
        onSelectionChange={handleSelectionChange}
      />

      <section className="panel bottom-panel">
        <div className="panel-header">
          <Tabs
            active={bottomTab}
            tabs={BOTTOM_TABS}
            onChange={(id) => setBottomTab(id as BottomTab)}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copy(bottomTab === 'report' ? reportJson : consoleLines)}
          >
            <Copy size={13} />
            Copy
          </Button>
        </div>
        <div className="bottom-content">
          {bottomTab === 'console' && <ConsolePanel error={error} lines={consoleLines} />}
          {bottomTab === 'observations' && (
            <ObservationsPanel hypotheses={hypotheses} observations={observations} />
          )}
          {bottomTab === 'audit' && (
            <AuditPanel
              pendingApprovals={pendingApprovals}
              recentApprovals={recentApprovals}
              steps={displaySteps}
            />
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

type ComposerMode = 'search' | 'think' | null
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

function createContextAttachment(): Attachment {
  return {
    id: `ctx-${Date.now()}`,
    name: 'Contexte du run courant',
    kind: 'CTX',
    size: 0,
  }
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
  defaultMode,
  captureContextByDefault,
  contextSummary,
}: {
  prompt: string
  onPromptChange(value: string): void
  onSend(submission?: PromptSubmission): void
  onStop(): void
  onNotice(message: string): void
  phase: ComposerPhase
  defaultMode: ComposerDefaultMode
  captureContextByDefault: boolean
  contextSummary: string
}): React.ReactElement {
  const [mode, setMode] = useState<ComposerMode>(
    defaultMode === 'search' || defaultMode === 'think' ? defaultMode : null
  )
  const [canvas, setCanvas] = useState(defaultMode === 'canvas')
  const [files, setFiles] = useState<Attachment[]>(() =>
    captureContextByDefault ? [createContextAttachment()] : []
  )
  const [showGuide, setShowGuide] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const busy = phase === 'generating' || phase === 'thinking'
  const hasContent = prompt.trim().length > 0 || files.length > 0
  const hasContext = files.some((file) => file.kind === 'CTX')

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
    setMode((current) => (current === next ? null : next))
  }

  function addFiles(list: FileList): void {
    const incoming: Attachment[] = Array.from(list).map((file) => {
      const kind = attachmentKind(file)
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        kind,
        size: file.size,
        url: kind === 'IMG' ? URL.createObjectURL(file) : undefined,
      }
    })
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name))
      return [...prev, ...incoming.filter((f) => !seen.has(f.name))]
    })
  }

  function captureContext(): void {
    setFiles((prev) =>
      prev.some((file) => file.kind === 'CTX')
        ? prev.filter((file) => file.kind !== 'CTX')
        : [...prev, createContextAttachment()]
    )
    onNotice(hasContext ? 'Contexte retiré' : 'Contexte capturé')
  }

  function removeFile(id: string): void {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target?.url) URL.revokeObjectURL(target.url)
      return prev.filter((f) => f.id !== id)
    })
  }

  function submit(): void {
    if (!hasContent) return
    onSend({
      search: mode === 'search',
      reasoning: mode === 'think',
      canvas,
      contextSummary: hasContext ? contextSummary : undefined,
    })
    files.forEach((f) => f.url && URL.revokeObjectURL(f.url))
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
          {files.map((file) => (
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
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {(hasContext || mode || canvas) && (
        <div className="composer-mode-strip" aria-label="Options actives pour la mission">
          {hasContext && (
            <span data-accent="context">
              <Crosshair size={12} /> Contexte du run joint
            </span>
          )}
          {mode === 'search' && (
            <span data-accent="search">
              <Globe size={12} /> Sources externes · approbation réseau
            </span>
          )}
          {mode === 'think' && (
            <span data-accent="think">
              <BrainCog size={12} /> ≥ 14 étapes · contre-vérification
            </span>
          )}
          {canvas && (
            <span data-accent="canvas">
              <FolderCode size={12} /> Livrable final structuré
            </span>
          )}
        </div>
      )}

      {showGuide && <ComposerGuide onClose={() => setShowGuide(false)} />}

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
            onChange={(event) => {
              if (event.target.files?.length) addFiles(event.target.files)
              event.target.value = ''
            }}
          />

          <button
            aria-label={hasContext ? 'Retirer le contexte du run' : 'Capturer le contexte du run'}
            aria-pressed={hasContext}
            className="composer-tool icon-only"
            data-accent="context"
            data-active={hasContext}
            title="Contexte — joindre le run, le nœud sélectionné et les observations récentes"
            type="button"
            onClick={captureContext}
          >
            <Crosshair size={16} />
          </button>

          <span className="composer-divider" />

          <button
            aria-label="Activer la recherche assistée"
            aria-pressed={mode === 'search'}
            className="composer-tool"
            data-accent="search"
            data-active={mode === 'search'}
            title="Recherche — consulter des sources externes sous approbation réseau"
            type="button"
            onClick={() => toggleMode('search')}
          >
            <Globe size={16} />
            {mode === 'search' && <span>Recherche</span>}
          </button>

          <button
            aria-label="Activer le raisonnement approfondi"
            aria-pressed={mode === 'think'}
            className="composer-tool"
            data-accent="think"
            data-active={mode === 'think'}
            title="Raisonnement — augmenter le budget et contre-vérifier les conclusions"
            type="button"
            onClick={() => toggleMode('think')}
          >
            <BrainCog size={16} />
            {mode === 'think' && <span>Raisonnement</span>}
          </button>

          <button
            aria-label="Activer le canvas structuré"
            aria-pressed={canvas}
            className="composer-tool"
            data-accent="canvas"
            data-active={canvas}
            title="Canvas — produire un rapport final en blocs réutilisables"
            type="button"
            onClick={() => setCanvas((current) => !current)}
          >
            <FolderCode size={16} />
            {canvas && <span>Canvas</span>}
          </button>

          <button
            aria-expanded={showGuide}
            aria-label="Afficher le guide des fonctions"
            className="composer-tool icon-only composer-help"
            data-active={showGuide}
            title="Comment utiliser les fonctions du prompt"
            type="button"
            onClick={() => setShowGuide((current) => !current)}
          >
            <CircleHelp size={16} />
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

function ComposerGuide({ onClose }: { onClose(): void }): React.ReactElement {
  return (
    <section className="composer-guide" aria-label="Guide des fonctions du prompt">
      <header>
        <span>
          <Sparkles size={14} />
          <strong>Exploiter les fonctions</strong>
        </span>
        <button aria-label="Fermer le guide" type="button" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="composer-guide__grid">
        <GuideItem
          icon={<Crosshair size={14} />}
          title="Contexte"
          text="Sélectionnez un nœud, puis joignez son état et les preuves récentes."
        />
        <GuideItem
          icon={<Globe size={14} />}
          title="Recherche"
          text="À activer pour des sources actuelles ; le réseau reste soumis à approbation."
        />
        <GuideItem
          icon={<BrainCog size={14} />}
          title="Raisonnement"
          text="Pour les diagnostics complexes : plan, ≥ 14 étapes et contre-vérification."
        />
        <GuideItem
          icon={<FolderCode size={14} />}
          title="Canvas"
          text="À combiner au Raisonnement pour obtenir un rapport structuré et réutilisable."
        />
      </div>
      <p>Recherche et Raisonnement sont alternatifs ; Canvas peut se combiner avec chacun.</p>
    </section>
  )
}

function GuideItem({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}): React.ReactElement {
  return (
    <div className="composer-guide__item">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
    </div>
  )
}

function buildComposerContextSummary({
  currentRunId,
  state,
  selectedNode,
  observations,
}: {
  currentRunId: string | null
  state: AgentUiState
  selectedNode?: ExecutionGraphNode
  observations: AgentRunStep[]
}): string {
  const lines = [`Run: ${currentRunId ?? 'nouvelle mission'}`, `État: ${formatState(state)}`]
  if (selectedNode) {
    lines.push(
      `Nœud sélectionné: ${selectedNode.title} (${selectedNode.kind}, ${selectedNode.status})`,
      `Résumé du nœud: ${selectedNode.summary}`
    )
  }
  const recentObservations = observations.slice(-3)
  if (recentObservations.length > 0) {
    lines.push('Observations récentes:')
    recentObservations.forEach((observation, index) => {
      lines.push(`${index + 1}. ${observation.content.replace(/\s+/g, ' ').trim().slice(0, 480)}`)
    })
  } else {
    lines.push('Observations récentes: aucune observation disponible')
  }
  return lines.join('\n')
}

interface ConsoleLine {
  id: string
  time: string
  tag: string
  tone: string
  text: string
}

function ConsolePanel({
  lines,
  error,
}: {
  lines: ConsoleLine[]
  error: string | null
}): React.ReactElement {
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
      {lines.map((line) => (
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
          observations.map((step) => (
            <ObservationView key={step.id ?? `${step.type}-${step.timestamp}`} step={step} />
          ))
        )}
      </section>
      <section style={{ gridColumn: 'span 5' }} className="stack-4">
        <span className="section-label">
          <Sparkles size={13} /> Hypothèses
        </span>
        {hypotheses.length === 0 ? (
          <p className="muted">Aucune étape de raisonnement.</p>
        ) : (
          hypotheses.map((step) => (
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
      <div className="toolbar-line">
        <span className="section-label">Rapport complet</span>
        <Button size="sm" variant="primary" onClick={() => downloadReportWord(report)}>
          <FileDown size={13} />
          Télécharger (Word)
        </Button>
      </div>
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
  const auditSteps = [...steps].filter(
    (step) => step.toolCall || step.type === 'observation' || step.type === 'observe'
  )
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
      {approvals.map((item) => (
        <li
          className="timeline-item"
          data-tone={
            item.status === 'approved'
              ? 'success'
              : item.status === 'pending'
                ? 'warning'
                : 'danger'
          }
          key={item.id}
        >
          <div className="timeline-marker" />
          <div className="timeline-body">
            <div className="timeline-head">
              <Badge
                tone={
                  item.status === 'pending'
                    ? 'warning'
                    : item.status === 'approved'
                      ? 'success'
                      : 'danger'
                }
              >
                {item.status}
              </Badge>
              <span className="mono">{item.intentKind}</span>
              <time className="mono muted">{item.createdAt}</time>
            </div>
            <p className="muted">{item.summary}</p>
          </div>
        </li>
      ))}
      {auditSteps.reverse().map((step) => (
        <li
          className="timeline-item"
          data-tone={getStepTone(step)}
          key={step.id ?? `${step.type}-${step.timestamp}`}
        >
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

function buildConsoleLines(
  steps: AgentRunStep[],
  isDemo: boolean,
  pendingApproval: ApprovalRequestView | undefined
): ConsoleLine[] {
  if (isDemo) {
    return [
      {
        id: 'd1',
        time: '12:41:07',
        tag: 'agent',
        tone: 'accent',
        text: 'plan: host-discovery → port-scan → service-fingerprint',
      },
      {
        id: 'd2',
        time: '12:41:08',
        tag: 'intent',
        tone: 'info',
        text: 'network.scan · nmap -sV 10.0.4.0/24 (risk=MEDIUM)',
      },
      {
        id: 'd3',
        time: '12:41:08',
        tag: 'policy',
        tone: 'warning',
        text: 'requires_approval — scan actif sur /24',
      },
      {
        id: 'd4',
        time: '12:41:08',
        tag: 'await',
        tone: 'warning',
        text: 'approbation humaine requise… expire 04:52',
      },
    ]
  }
  const lines = steps.map((step, index) => ({
    id: step.id ?? `line-${index}`,
    time: formatClock(step.timestamp),
    tag: consoleTag(step),
    tone: consoleTone(step),
    text: step.toolCall
      ? `${step.toolCall.name} · ${trim(step.content, 120)}`
      : trim(step.content, 140),
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
    )
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

function formatState(state: string): string {
  return state
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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
