import { Copy, GitBranch, History, Play, Search, UnfoldVertical } from 'lucide-react'
import type {
  ExecutionGraphBlock,
  ExecutionGraphEdge,
  ExecutionGraphNode,
  ExecutionGraphSelection,
  ExecutionGraphSnapshot,
  ExecutionNodeStatus,
} from '@shared/types/execution-graph.types'
import { graphNodeSearchText } from '../../lib/execution-graph'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import {
  executionNodeIcon,
  executionNodeKindLabel,
  executionStatusLabel,
} from './execution-graph-ui'

export interface ExecutionGraphInspectorProps {
  graph: ExecutionGraphSnapshot
  sourceGraph: ExecutionGraphSnapshot
  selection: ExecutionGraphSelection | null
  search: string
  canDecide: boolean
  onSearchChange(value: string): void
  onSelectionChange(selection: ExecutionGraphSelection): void
  onCopy(value: unknown): void
  onApprove(): void
  onReject(): void
  onOpenAudit(): void
  onReplayTo(stepCount: number): void
  onExpandBlock(blockId: string): void
}

export function ExecutionGraphInspector({
  graph,
  sourceGraph,
  selection,
  search,
  canDecide,
  onSearchChange,
  onSelectionChange,
  onCopy,
  onApprove,
  onReject,
  onOpenAudit,
  onReplayTo,
  onExpandBlock,
}: ExecutionGraphInspectorProps): React.ReactElement {
  const selectedNode =
    selection?.type === 'node' ? graph.nodes.find((node) => node.id === selection.id) : undefined
  const selectedEdge =
    selection?.type === 'edge' ? graph.edges.find((edge) => edge.id === selection.id) : undefined
  const selectedBlock =
    selection?.type === 'block'
      ? sourceGraph.blocks.find((block) => block.id === selection.id)
      : undefined
  const fallbackNode =
    graph.nodes.find((node) => ['active', 'running', 'awaiting_approval'].includes(node.status)) ??
    graph.nodes[0]
  const entity: SelectedEntity = selectedEdge
    ? { type: 'edge', value: selectedEdge }
    : selectedBlock
      ? { type: 'block', value: selectedBlock }
      : { type: 'node', value: selectedNode ?? fallbackNode }
  const normalizedSearch = search.trim().toLocaleLowerCase('fr')
  const results = normalizedSearch
    ? sourceGraph.nodes
        .filter((node) => graphNodeSearchText(node).includes(normalizedSearch))
        .slice(0, 8)
    : []

  return (
    <aside className="panel inspector-panel execution-inspector">
      <div className="inspector-search">
        <div className="execution-search-field">
          <Search size={14} />
          <Input
            aria-label="Rechercher dans le graphe"
            placeholder="Nœud, outil, cible, état…"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        {search && (
          <div className="execution-search-results">
            {results.length === 0 && <span className="muted">Aucun nœud correspondant.</span>}
            {results.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectionChange({ type: 'node', id: node.id })}
              >
                <span data-status={node.status} />
                <strong>{node.title}</strong>
                <small>{node.summary}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="inspector-body">
        {entity.type === 'node' && entity.value && (
          <NodeDetails
            graph={sourceGraph}
            node={entity.value}
            onCopy={onCopy}
            onExpandBlock={onExpandBlock}
          />
        )}
        {entity.type === 'edge' && (
          <EdgeDetails edge={entity.value} graph={sourceGraph} onCopy={onCopy} />
        )}
        {entity.type === 'block' && (
          <BlockDetails block={entity.value} graph={sourceGraph} onCopy={onCopy} />
        )}
      </div>

      <div className="inspector-foot">
        {canDecide ? (
          <>
            <Button variant="success" onClick={onApprove}>
              Approuver
            </Button>
            <Button variant="danger" onClick={onReject}>
              Rejeter
            </Button>
          </>
        ) : entity.type === 'node' && replayStepCount(entity.value) !== undefined ? (
          <>
            <Button variant="subtle" onClick={() => onReplayTo(replayStepCount(entity.value) ?? 0)}>
              <Play size={14} /> Revoir ici
            </Button>
            <Button variant="ghost" onClick={onOpenAudit}>
              <History size={14} /> Audit
            </Button>
          </>
        ) : (
          <>
            <Button variant="subtle" onClick={() => onCopy(entityData(entity))}>
              <Copy size={14} /> Copier
            </Button>
            <Button variant="ghost" onClick={onOpenAudit}>
              <History size={14} /> Audit
            </Button>
          </>
        )}
      </div>
    </aside>
  )
}

type SelectedEntity =
  | { type: 'node'; value: ExecutionGraphNode | undefined }
  | { type: 'edge'; value: ExecutionGraphEdge }
  | { type: 'block'; value: ExecutionGraphBlock }

function NodeDetails({
  node,
  graph,
  onCopy,
  onExpandBlock,
}: {
  node: ExecutionGraphNode
  graph: ExecutionGraphSnapshot
  onCopy(value: unknown): void
  onExpandBlock(blockId: string): void
}): React.ReactElement {
  const Icon = executionNodeIcon(node.kind)
  const inbound = graph.edges.filter((edge) => edge.target === node.id)
  const outbound = graph.edges.filter((edge) => edge.source === node.id)
  const collapsedBlockId =
    typeof node.data['collapsedBlockId'] === 'string' ? node.data['collapsedBlockId'] : undefined
  return (
    <>
      <section className="inspector-section">
        <span className="section-label">Nœud d’exécution</span>
        <div className="inspector-node-head">
          <span className="graph-node-icon" data-node={node.status}>
            <Icon size={17} />
          </span>
          <div className="inspector-node-title">
            <strong>{node.title}</strong>
            <span>{node.summary}</span>
          </div>
          <Badge tone={statusTone(node.status)}>{executionStatusLabel(node.status)}</Badge>
        </div>
        <div className="execution-inspector-tags">
          <span>{executionNodeKindLabel(node.kind)}</span>
          <span>instance #{node.sequence}</span>
          <span>tentative {node.attempt}</span>
        </div>
        <dl className="kv-grid">
          <dt>runId</dt>
          <dd className="truncate">{node.runId ?? '—'}</dd>
          <dt>définition</dt>
          <dd className="truncate">{node.definitionId}</dd>
          <dt>bloc</dt>
          <dd>{node.blockId}</dd>
          <dt>outil</dt>
          <dd>{node.tool ?? '—'}</dd>
          <dt>cible</dt>
          <dd className="truncate">{node.target ?? 'workspace local'}</dd>
          <dt>durée</dt>
          <dd>{node.durationMs === undefined ? '—' : formatDuration(node.durationMs)}</dd>
          <dt>confiance</dt>
          <dd>
            {node.confidenceScore === undefined
              ? '—'
              : `${Math.round(node.confidenceScore * 100)}%`}
          </dd>
        </dl>
      </section>

      <section className="inspector-section">
        <div className="toolbar-line">
          <span className="section-label">Risque et rôle</span>
          <span className="risk-chip" data-risk={node.riskLevel}>
            {node.riskScore}/100
          </span>
        </div>
        <div className="risk-meter" data-risk={node.riskLevel}>
          <span style={{ width: `${node.riskScore}%` }} />
        </div>
        <p className="inspector-desc">{node.description}</p>
      </section>

      <section className="inspector-section">
        <span className="section-label">Contrat des ports</span>
        <div className="execution-port-list">
          {[...node.inputs, ...node.outputs].map((item) => (
            <div data-direction={item.direction} key={`${item.direction}:${item.id}`}>
              <span />
              <strong>{item.label}</strong>
              <small>{item.dataType}</small>
            </div>
          ))}
        </div>
        <div className="execution-flow-counts">
          <span>{inbound.length} entrée(s)</span>
          <GitBranch size={13} />
          <span>{outbound.length} sortie(s)</span>
        </div>
      </section>

      <section className="inspector-section">
        <div className="toolbar-line">
          <span className="section-label">Données observables</span>
          <Button size="sm" variant="ghost" onClick={() => onCopy(node.data)}>
            <Copy size={13} /> Copier
          </Button>
        </div>
        <pre className="json-block">{JSON.stringify(node.data, null, 2)}</pre>
      </section>

      {node.sourceStepIds.length > 0 && (
        <section className="inspector-section">
          <span className="section-label">Provenance</span>
          <div className="execution-source-list">
            {node.sourceStepIds.map((id) => (
              <code key={id}>{id}</code>
            ))}
          </div>
        </section>
      )}

      {node.recommendations.length > 0 && (
        <section className="inspector-section">
          <span className="section-label">Garde-fous</span>
          <ul className="execution-recommendations">
            {node.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {collapsedBlockId && (
        <Button variant="subtle" onClick={() => onExpandBlock(collapsedBlockId)}>
          <UnfoldVertical size={14} /> Déplier {node.title}
        </Button>
      )}
    </>
  )
}

function EdgeDetails({
  edge,
  graph,
  onCopy,
}: {
  edge: ExecutionGraphEdge
  graph: ExecutionGraphSnapshot
  onCopy(value: unknown): void
}): React.ReactElement {
  const source = graph.nodes.find((node) => node.id === edge.source)
  const target = graph.nodes.find((node) => node.id === edge.target)
  return (
    <>
      <section className="inspector-section">
        <span className="section-label">Flux sélectionné</span>
        <div className="execution-edge-route">
          <strong>{source?.title ?? edge.source}</strong>
          <span data-kind={edge.kind}>{edge.label ?? edge.kind}</span>
          <strong>{target?.title ?? edge.target}</strong>
        </div>
        <dl className="kv-grid">
          <dt>type</dt>
          <dd>{edge.kind}</dd>
          <dt>statut</dt>
          <dd>{edge.status}</dd>
          <dt>port source</dt>
          <dd>{edge.sourcePort ?? '—'}</dd>
          <dt>port cible</dt>
          <dd>{edge.targetPort ?? '—'}</dd>
          <dt>condition</dt>
          <dd className="truncate">{edge.condition ?? '—'}</dd>
        </dl>
      </section>
      <section className="inspector-section">
        <div className="toolbar-line">
          <span className="section-label">Charge transmise</span>
          <Button size="sm" variant="ghost" onClick={() => onCopy(edge)}>
            <Copy size={13} /> Copier
          </Button>
        </div>
        <pre className="json-block">
          {edge.payloadPreview ?? 'Aucun aperçu disponible — consulter les nœuds source et cible.'}
        </pre>
      </section>
    </>
  )
}

function BlockDetails({
  block,
  graph,
  onCopy,
}: {
  block: ExecutionGraphBlock
  graph: ExecutionGraphSnapshot
  onCopy(value: unknown): void
}): React.ReactElement {
  const nodes = block.nodeIds
    .map((id) => graph.nodes.find((node) => node.id === id))
    .filter(isDefined)
  return (
    <>
      <section className="inspector-section">
        <span className="section-label">Bloc réutilisable</span>
        <div className="inspector-node-head">
          <span className="graph-node-icon">
            <GitBranch size={17} />
          </span>
          <div className="inspector-node-title">
            <strong>{block.title}</strong>
            <span>{block.description}</span>
          </div>
          <Badge tone={statusTone(block.status)}>{executionStatusLabel(block.status)}</Badge>
        </div>
        <dl className="kv-grid">
          <dt>identifiant</dt>
          <dd>{block.id}</dd>
          <dt>définition</dt>
          <dd className="truncate">{block.definitionId}</dd>
          <dt>version</dt>
          <dd>v{block.version}</dd>
          <dt>séquence</dt>
          <dd>{block.sequence}</dd>
          <dt>nœuds</dt>
          <dd>{nodes.length}</dd>
          <dt>repliable</dt>
          <dd>{block.collapsible ? 'oui' : 'non'}</dd>
        </dl>
      </section>
      <section className="inspector-section">
        <div className="toolbar-line">
          <span className="section-label">Opérations internes</span>
          <Button size="sm" variant="ghost" onClick={() => onCopy({ block, nodes })}>
            <Copy size={13} /> Copier
          </Button>
        </div>
        <ol className="execution-block-node-list">
          {nodes.map((node) => (
            <li key={node.id}>
              <span data-status={node.status} />
              <strong>{node.title}</strong>
              <small>{executionStatusLabel(node.status)}</small>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function replayStepCount(node?: ExecutionGraphNode): number | undefined {
  if (!node) return undefined
  const value = node.data['stepIndex']
  return typeof value === 'number' ? value : undefined
}

function entityData(entity: SelectedEntity): unknown {
  if (entity.type === 'node') return entity.value?.data ?? {}
  return entity.value
}

function statusTone(status: ExecutionNodeStatus): BadgeTone {
  if (status === 'done') return 'success'
  if (status === 'awaiting_approval') return 'warning'
  if (status === 'blocked' || status === 'error') return 'danger'
  if (status === 'active' || status === 'running') return 'accent'
  return 'neutral'
}

function formatDuration(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
