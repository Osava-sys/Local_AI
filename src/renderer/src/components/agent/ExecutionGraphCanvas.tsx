import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  Filter,
  Focus,
  Layers3,
  Minus,
  Plus,
  ScanSearch,
  Workflow,
} from 'lucide-react'
import type {
  ExecutionGraphBlock,
  ExecutionGraphFilter,
  ExecutionGraphNode,
  ExecutionGraphSelection,
  ExecutionGraphSnapshot,
  ExecutionNodePosition,
} from '@shared/types/execution-graph.types'
import {
  EXECUTION_NODE_HEIGHT,
  EXECUTION_NODE_WIDTH,
  LIVE_STATUSES,
  executionBlockFrame,
  type ExecutionBlockFrame,
} from '../../lib/execution-graph'
import {
  executionNodeIcon,
  executionNodeKindLabel,
  executionStatusLabel,
} from './execution-graph-ui'

const NODE_WIDTH = EXECUTION_NODE_WIDTH
const NODE_HEIGHT = EXECUTION_NODE_HEIGHT
const MIN_SCALE = 0.22
const MAX_SCALE = 1.7
/** Bumped from v1: layouts are now scoped to the run that produced them. */
const LAYOUT_STORAGE_KEY = 'nexus.execution-graph.layout.v2'
/** Pointer travel below this is a click, not a drag, and must not rewrite the layout. */
const DRAG_THRESHOLD_PX = 3

export type ExecutionGraphViewMode = 'trace' | 'blocks'

interface ViewportState {
  x: number
  y: number
  scale: number
}

interface DragState {
  nodeId: string
  pointerId: number
  startX: number
  startY: number
  origin: ExecutionNodePosition
  moved: boolean
}

interface PanState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

export interface ExecutionGraphCanvasProps {
  graph: ExecutionGraphSnapshot
  statusContent?: React.ReactNode
  selection: ExecutionGraphSelection | null
  filter: ExecutionGraphFilter
  viewMode: ExecutionGraphViewMode
  collapsedBlockIds: ReadonlySet<string>
  visibleStepCount: number
  totalStepCount: number
  isFollowingLive: boolean
  onSelectionChange(selection: ExecutionGraphSelection): void
  onFilterChange(filter: ExecutionGraphFilter): void
  onViewModeChange(mode: ExecutionGraphViewMode): void
  onBlockToggle(blockId: string): void
  onReplayChange(stepCount: number): void
  onReturnToLive(): void
  onNotice(message: string): void
}

export function ExecutionGraphCanvas({
  graph,
  statusContent,
  selection,
  filter,
  viewMode,
  collapsedBlockIds,
  visibleStepCount,
  totalStepCount,
  isFollowingLive,
  onSelectionChange,
  onFilterChange,
  onViewModeChange,
  onBlockToggle,
  onReplayChange,
  onReturnToLive,
  onNotice,
}: ExecutionGraphCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLDivElement>(null)
  const runKey = graph.runId ?? 'draft'
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, scale: 0.7 })
  const viewportRef = useRef(viewport)
  const [positions, setPositions] = useState<Record<string, ExecutionNodePosition>>(() =>
    readStoredLayout(runKey)
  )
  const positionsRef = useRef(positions)
  const [isPanning, setIsPanning] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const dragRef = useRef<DragState | null>(null)
  const panRef = useRef<PanState | null>(null)
  const hasFittedRef = useRef(false)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  const positionOf = useCallback(
    (node: ExecutionGraphNode): ExecutionNodePosition => positions[node.id] ?? node.position,
    [positions]
  )

  const fitGraph = useCallback((): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const padding = 24
    const scale = clamp(
      Math.min(
        (rect.width - padding * 2) / graph.world.width,
        (rect.height - padding * 2) / graph.world.height
      ),
      MIN_SCALE,
      1
    )
    const next = {
      scale,
      x: (rect.width - graph.world.width * scale) / 2,
      y: (rect.height - graph.world.height * scale) / 2,
    }
    viewportRef.current = next
    setViewport(next)
  }, [graph.world.height, graph.world.width])

  const fitRef = useRef(fitGraph)
  useEffect(() => {
    fitRef.current = fitGraph
  }, [fitGraph])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setCanvasSize({ width: rect.width, height: rect.height })
      // A canvas that was still zero-sized when the run mounted gets its one fit here.
      if (!hasFittedRef.current && rect.width >= 1 && rect.height >= 1) {
        fitRef.current()
        hasFittedRef.current = true
      }
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // Fit once per run. The world grows every time a cycle streams in, and refitting on that
  // would throw away the pan and zoom the operator chose mid-investigation.
  useEffect(() => {
    hasFittedRef.current = false
    const frame = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      fitRef.current()
      hasFittedRef.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [runKey])

  // Restore this run's manual layout when the run changes (mount already read it). Node ids
  // repeat across runs, so a layout not scoped to its run would replay run A's drags onto
  // run B and pile its nodes on top of each other.
  const restoredRunRef = useRef(runKey)
  useEffect(() => {
    if (restoredRunRef.current === runKey) return
    restoredRunRef.current = runKey
    const restored = readStoredLayout(runKey)
    positionsRef.current = restored
    setPositions(restored)
  }, [runKey])

  const selectedNodeId = selection?.type === 'node' ? selection.id : null
  const selectedEdgeId = selection?.type === 'edge' ? selection.id : null
  const detailLevel =
    viewport.scale >= 0.72 ? 'full' : viewport.scale >= 0.48 ? 'compact' : 'minimal'
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])
  const nodeByIdRef = useRef(nodeById)
  useEffect(() => {
    nodeByIdRef.current = nodeById
  }, [nodeById])

  const liveNodeId = useMemo(
    () => graph.nodes.find((node) => LIVE_STATUSES.includes(node.status))?.id ?? null,
    [graph.nodes]
  )

  // Follow the playhead only when it moves to a different node. Keying this on positions
  // instead would recentre the viewport under the pointer on every frame of a drag.
  useEffect(() => {
    if (!isFollowingLive || !liveNodeId || dragRef.current) return
    const canvas = canvasRef.current
    const node = nodeByIdRef.current.get(liveNodeId)
    if (!canvas || !node) return
    const rect = canvas.getBoundingClientRect()
    const position = positionsRef.current[liveNodeId] ?? node.position
    const current = viewportRef.current
    const screenX = current.x + (position.x + NODE_WIDTH / 2) * current.scale
    const screenY = current.y + (position.y + NODE_HEIGHT / 2) * current.scale
    const margin = 100
    if (
      screenX > margin &&
      screenX < rect.width - margin &&
      screenY > margin &&
      screenY < rect.height - margin
    )
      return
    setViewport((value) => ({
      ...value,
      x: rect.width / 2 - (position.x + NODE_WIDTH / 2) * value.scale,
      y: rect.height / 2 - (position.y + NODE_HEIGHT / 2) * value.scale,
    }))
  }, [isFollowingLive, liveNodeId])

  // Frames follow their members, including the synthetic summary node of a collapsed block,
  // so dragging a node out of a block widens the frame instead of leaving it behind.
  const blockFrames = useMemo(() => {
    const positionsByBlock = new Map<string, ExecutionNodePosition[]>()
    for (const node of graph.nodes) {
      const position = positions[node.id] ?? node.position
      const list = positionsByBlock.get(node.blockId)
      if (list) list.push(position)
      else positionsByBlock.set(node.blockId, [position])
    }
    return graph.blocks
      .map((block) => {
        const frame = executionBlockFrame(positionsByBlock.get(block.id) ?? [])
        return frame ? { block, frame } : undefined
      })
      .filter(
        (item): item is { block: ExecutionGraphBlock; frame: ExecutionBlockFrame } =>
          item !== undefined
      )
  }, [graph.blocks, graph.nodes, positions])

  function setScale(nextScale: number, anchor?: { x: number; y: number }): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const current = viewportRef.current
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE)
    const point = anchor ?? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }
    const worldX = (point.x - current.x) / current.scale
    const worldY = (point.y - current.y) / current.scale
    const next = {
      scale,
      x: point.x - worldX * scale,
      y: point.y - worldY * scale,
    }
    viewportRef.current = next
    setViewport(next)
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY > 0 ? 0.9 : 1.1
      setScale(viewportRef.current.scale * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
      return
    }
    setViewport((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }))
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    const target = event.target as Element
    if (
      target.closest(
        '.execution-node, .execution-edge-hit, .execution-block__header, .execution-zoom, .execution-minimap'
      )
    )
      return
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewportRef.current.x,
      originY: viewportRef.current.y,
    }
    setIsPanning(true)
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    setViewport((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    }))
  }

  function handleCanvasPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleNodePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    node: ExecutionGraphNode
  ): void {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      nodeId: node.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: positionOf(node),
      moved: false,
    }
    onSelectionChange({ type: 'node', id: node.id })
  }

  function handleNodePointerMove(event: React.PointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    const scale = viewportRef.current.scale
    const x = clamp(drag.origin.x + dx / scale, 8, graph.world.width - NODE_WIDTH - 8)
    const y = clamp(drag.origin.y + dy / scale, 8, graph.world.height - NODE_HEIGHT - 8)
    setPositions((current) => {
      const next = { ...current, [drag.nodeId]: { x, y } }
      positionsRef.current = next
      return next
    })
  }

  function handleNodePointerUp(event: React.PointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.moved) persistLayout(runKey, positionsRef.current)
  }

  function resetLayout(): void {
    setPositions({})
    positionsRef.current = {}
    clearStoredLayout()
    fitGraph()
    onNotice('Disposition et cadrage réinitialisés')
  }

  function centerOnNode(node: ExecutionGraphNode): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const pos = positionOf(node)
    setViewport((current) => ({
      ...current,
      x: canvas.clientWidth / 2 - (pos.x + NODE_WIDTH / 2) * current.scale,
      y: canvas.clientHeight / 2 - (pos.y + NODE_HEIGHT / 2) * current.scale,
    }))
  }

  return (
    <div className="execution-graph-shell">
      <GraphToolbar
        filter={filter}
        isFollowingLive={isFollowingLive}
        totalStepCount={totalStepCount}
        viewMode={viewMode}
        visibleStepCount={visibleStepCount}
        statusContent={statusContent}
        onFilterChange={onFilterChange}
        onFit={fitGraph}
        onReplayChange={onReplayChange}
        onReset={resetLayout}
        onReturnToLive={onReturnToLive}
        onViewModeChange={onViewModeChange}
      />

      <div
        ref={canvasRef}
        className="execution-graph-canvas"
        data-panning={isPanning}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onWheel={handleWheel}
      >
        <div
          className="execution-graph-world"
          style={{
            width: graph.world.width,
            height: graph.world.height,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          {blockFrames.map(({ block, frame }) => {
            const collapsed = collapsedBlockIds.has(block.id)
            const selected = selection?.type === 'block' && selection.id === block.id
            return (
              <section
                className="execution-block"
                data-collapsed={collapsed}
                data-selected={selected}
                data-status={block.status}
                key={block.id}
                style={{
                  left: frame.position.x,
                  top: frame.position.y,
                  width: frame.width,
                  height: frame.height,
                }}
              >
                <div className="execution-block__header">
                  <button
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? 'Déplier' : 'Replier'} ${block.title}`}
                    className="execution-block__toggle"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onBlockToggle(block.id)
                    }}
                  >
                    {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button
                    aria-pressed={selected}
                    className="execution-block__label"
                    title={`Inspecter ${block.title}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectionChange({ type: 'block', id: block.id })
                    }}
                  >
                    <span>{block.title}</span>
                    <small>{block.nodeIds.length}</small>
                  </button>
                </div>
              </section>
            )
          })}

          <svg
            aria-label="Connexions du graphe d’exécution"
            className="execution-edges"
            height={graph.world.height}
            viewBox={`0 0 ${graph.world.width} ${graph.world.height}`}
            width={graph.world.width}
          >
            <defs>
              {(['control', 'data', 'condition', 'context', 'evidence'] as const).map((kind) => (
                <marker
                  id={`arrow-${kind}`}
                  key={kind}
                  markerHeight="7"
                  markerWidth="7"
                  orient="auto"
                  refX="6"
                  refY="3.5"
                  viewBox="0 0 7 7"
                >
                  <path
                    className={`execution-arrow execution-arrow--${kind}`}
                    d="M 0 0 L 7 3.5 L 0 7 z"
                  />
                </marker>
              ))}
            </defs>
            {graph.edges.map((edge) => {
              const source = nodeById.get(edge.source)
              const target = nodeById.get(edge.target)
              if (!source || !target) return null
              const path = edgePath(positionOf(source), positionOf(target))
              const selected = selectedEdgeId === edge.id
              return (
                <g key={edge.id}>
                  <path
                    className="execution-edge-hit"
                    d={path}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectionChange({ type: 'edge', id: edge.id })
                    }}
                  />
                  <path
                    className="execution-edge"
                    data-kind={edge.kind}
                    data-selected={selected}
                    data-status={edge.status}
                    d={path}
                    markerEnd={`url(#arrow-${edge.kind})`}
                  />
                </g>
              )
            })}
          </svg>

          {graph.nodes.map((node) => {
            const Icon = executionNodeIcon(node.kind)
            const pos = positionOf(node)
            const selected = selectedNodeId === node.id
            const collapsedSummary = typeof node.data['collapsedBlockId'] === 'string'
            return (
              <button
                aria-label={`${node.title}, ${node.summary}`}
                aria-pressed={selected}
                className="execution-node"
                data-detail={detailLevel}
                data-kind={node.kind}
                data-selected={selected}
                data-status={node.status}
                key={node.id}
                style={{ left: pos.x, top: pos.y }}
                type="button"
                onDoubleClick={() => centerOnNode(node)}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
              >
                <span className="execution-node__head">
                  <span className="execution-node__icon">
                    <Icon size={16} />
                  </span>
                  <span className="execution-node__title">{node.title}</span>
                  <span className="execution-node__sequence">
                    {collapsedSummary ? node.sourceStepIds.length : node.sequence}
                  </span>
                </span>
                <span className="execution-node__summary">{node.summary}</span>
                <span className="execution-node__foot">
                  <span className="execution-node__kind">{executionNodeKindLabel(node.kind)}</span>
                  {node.riskScore >= 35 && (
                    <span className="risk-chip" data-risk={node.riskLevel}>
                      {node.riskLevel}
                    </span>
                  )}
                  <span className="execution-node__status">
                    {executionStatusLabel(node.status)}
                  </span>
                </span>
                <span className="execution-port execution-port--input" aria-hidden="true" />
                <span className="execution-port execution-port--output" aria-hidden="true" />
              </button>
            )
          })}
        </div>

        <div className="execution-zoom" aria-label="Contrôles de zoom">
          <button
            aria-label="Dézoomer"
            type="button"
            onClick={() => setScale(viewport.scale - 0.1)}
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(viewport.scale * 100)}%</span>
          <button aria-label="Zoomer" type="button" onClick={() => setScale(viewport.scale + 0.1)}>
            <Plus size={15} />
          </button>
          <button aria-label="Ajuster le graphe" type="button" onClick={fitGraph}>
            <Focus size={15} />
          </button>
        </div>

        <GraphMinimap
          graph={graph}
          positions={positions}
          viewport={viewport}
          canvasSize={canvasSize}
          selection={selection}
          onNavigate={(x, y) => {
            const canvas = canvasRef.current
            if (!canvas) return
            setViewport((current) => ({
              ...current,
              x: canvas.clientWidth / 2 - x * current.scale,
              y: canvas.clientHeight / 2 - y * current.scale,
            }))
          }}
        />
      </div>
    </div>
  )
}

function GraphToolbar({
  filter,
  viewMode,
  visibleStepCount,
  totalStepCount,
  isFollowingLive,
  onFilterChange,
  onViewModeChange,
  onReplayChange,
  onReturnToLive,
  onFit,
  onReset,
  statusContent,
}: {
  filter: ExecutionGraphFilter
  viewMode: ExecutionGraphViewMode
  visibleStepCount: number
  totalStepCount: number
  isFollowingLive: boolean
  onFilterChange(filter: ExecutionGraphFilter): void
  onViewModeChange(mode: ExecutionGraphViewMode): void
  onReplayChange(value: number): void
  onReturnToLive(): void
  onFit(): void
  onReset(): void
  statusContent?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="execution-toolbar">
      {statusContent && <div className="execution-toolbar__status">{statusContent}</div>}
      <div className="execution-toolbar__group" aria-label="Mode du graphe">
        <button
          data-active={viewMode === 'trace'}
          title="Vue détaillée de la trace"
          type="button"
          onClick={() => onViewModeChange('trace')}
        >
          <Workflow size={14} /> Trace
        </button>
        <button
          data-active={viewMode === 'blocks'}
          title="Vue compacte par blocs"
          type="button"
          onClick={() => onViewModeChange('blocks')}
        >
          <Layers3 size={14} /> Blocs
        </button>
      </div>

      <div
        className="execution-toolbar__group execution-toolbar__filters"
        aria-label="Filtrer les nœuds"
      >
        <Filter size={13} />
        {(['all', 'active', 'decisions', 'evidence'] as const).map((item) => (
          <button
            data-active={filter === item}
            data-short={filterLabel(item).slice(0, 1)}
            key={item}
            title={`Filtrer : ${filterLabel(item)}`}
            type="button"
            onClick={() => onFilterChange(item)}
          >
            {filterLabel(item)}
          </button>
        ))}
      </div>

      <div className="execution-replay">
        <span className="execution-replay__label">Trace</span>
        <input
          aria-label="Position de relecture visuelle"
          disabled={totalStepCount === 0}
          max={Math.max(0, totalStepCount)}
          min="0"
          type="range"
          value={Math.min(visibleStepCount, totalStepCount)}
          onChange={(event) => onReplayChange(Number(event.target.value))}
        />
        <span className="mono">
          {visibleStepCount}/{totalStepCount}
        </span>
        <button
          className="execution-live-button"
          data-live={isFollowingLive}
          title={
            isFollowingLive
              ? 'La trace suit les événements en direct'
              : 'Revenir aux événements les plus récents'
          }
          type="button"
          onClick={onReturnToLive}
        >
          <span /> {isFollowingLive ? 'Direct' : 'Revenir au direct'}
        </button>
      </div>

      <div className="execution-toolbar__group execution-toolbar__utilities">
        <button title="Ajuster le graphe" type="button" onClick={onFit}>
          <ScanSearch size={14} />
        </button>
        <button title="Réinitialiser la disposition" type="button" onClick={onReset}>
          <CircleDot size={14} />
        </button>
      </div>
    </div>
  )
}

function GraphMinimap({
  graph,
  positions,
  viewport,
  canvasSize,
  selection,
  onNavigate,
}: {
  graph: ExecutionGraphSnapshot
  positions: Record<string, ExecutionNodePosition>
  viewport: ViewportState
  canvasSize: { width: number; height: number }
  selection: ExecutionGraphSelection | null
  onNavigate(x: number, y: number): void
}): React.ReactElement {
  const width = 168
  const height = 104
  const scale = Math.min(width / graph.world.width, height / graph.world.height)
  // Measured size arrives through props: reading the canvas ref here would render a stale
  // frame, since a ref read during render neither triggers nor survives a re-render.
  const hasSize = canvasSize.width > 0 && canvasSize.height > 0
  const frameWidth = hasSize ? Math.min(width, (canvasSize.width / viewport.scale) * scale) : width
  const frameHeight = hasSize
    ? Math.min(height, (canvasSize.height / viewport.scale) * scale)
    : height
  const frameX = clamp((-viewport.x / viewport.scale) * scale, 0, Math.max(0, width - frameWidth))
  const frameY = clamp((-viewport.y / viewport.scale) * scale, 0, Math.max(0, height - frameHeight))
  return (
    <button
      aria-label="Naviguer avec la minimap"
      className="execution-minimap"
      type="button"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        onNavigate((event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale)
      }}
    >
      {graph.nodes.map((node) => {
        const pos = positions[node.id] ?? node.position
        return (
          <span
            className="execution-minimap__dot"
            data-selected={selection?.type === 'node' && selection.id === node.id}
            data-status={node.status}
            key={node.id}
            style={{
              left: (pos.x + NODE_WIDTH / 2) * scale,
              top: (pos.y + NODE_HEIGHT / 2) * scale,
            }}
          />
        )
      })}
      <span
        className="execution-minimap__frame"
        style={{ left: frameX, top: frameY, width: frameWidth, height: frameHeight }}
      />
    </button>
  )
}

function filterLabel(filter: ExecutionGraphFilter): string {
  return { all: 'Tout', active: 'Actif', decisions: 'Décisions', evidence: 'Preuves' }[filter]
}

function edgePath(source: ExecutionNodePosition, target: ExecutionNodePosition): string {
  const sx = source.x + NODE_WIDTH
  const sy = source.y + NODE_HEIGHT / 2
  const tx = target.x
  const ty = target.y + NODE_HEIGHT / 2
  if (tx >= sx + 40) {
    const control = Math.max(60, (tx - sx) * 0.48)
    return `M ${sx} ${sy} C ${sx + control} ${sy}, ${tx - control} ${ty}, ${tx} ${ty}`
  }
  const down = Math.max(sy, ty) + 76
  return `M ${sx} ${sy} C ${sx + 80} ${sy}, ${sx + 80} ${down}, ${(sx + tx) / 2} ${down} C ${tx - 80} ${down}, ${tx - 80} ${ty}, ${tx} ${ty}`
}

interface StoredLayout {
  runId: string
  positions: Record<string, ExecutionNodePosition>
}

/**
 * A manual layout describes one run. Node ids (`cycle:1:decision`…) are stable across runs,
 * so the stored run id is checked before restoring: otherwise every new run would inherit the
 * previous one's drags and render its nodes on top of each other.
 */
function readStoredLayout(runId: string): Record<string, ExecutionNodePosition> {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<StoredLayout> | null
    if (!parsed || typeof parsed !== 'object') return {}
    if (parsed.runId !== runId || !parsed.positions || typeof parsed.positions !== 'object') {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed.positions).filter(([, value]) => isPosition(value))
    ) as Record<string, ExecutionNodePosition>
  } catch {
    return {}
  }
}

function persistLayout(runId: string, positions: Record<string, ExecutionNodePosition>): void {
  try {
    const payload: StoredLayout = { runId, positions }
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // A read-only or quota-constrained webview must not break the live run.
  }
}

function clearStoredLayout(): void {
  try {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY)
  } catch {
    // See persistLayout.
  }
}

function isPosition(value: unknown): value is ExecutionNodePosition {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ExecutionNodePosition>
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
