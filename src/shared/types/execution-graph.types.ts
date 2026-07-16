/**
 * Renderer-neutral contracts for the live agent execution graph.
 *
 * A graph node is an observable runtime instance, not an instruction to execute.
 * Keeping this contract in shared/ lets IPC and persistence adopt it later without
 * coupling the main process to React or to a specific canvas implementation.
 */

export type ExecutionNodeKind =
  | 'input'
  | 'agent'
  | 'decision'
  | 'memory'
  | 'tool'
  | 'policy'
  | 'approval'
  | 'sandbox'
  | 'observation'
  | 'verifier'
  | 'finding'
  | 'checkpoint'
  | 'report'

export type ExecutionNodeStatus =
  'pending' | 'active' | 'running' | 'awaiting_approval' | 'blocked' | 'error' | 'done' | 'skipped'

export type ExecutionPortDataType =
  | 'control'
  | 'prompt'
  | 'context'
  | 'intent'
  | 'approval'
  | 'artifact'
  | 'observation'
  | 'evidence'
  | 'finding'
  | 'report'

export type ExecutionEdgeKind = 'control' | 'data' | 'condition' | 'context' | 'evidence'

export type ExecutionEdgeStatus = 'pending' | 'active' | 'traversed' | 'blocked' | 'error'

export type ExecutionRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ExecutionPort {
  id: string
  label: string
  direction: 'input' | 'output'
  dataType: ExecutionPortDataType
  required?: boolean
}

export interface ExecutionNodePosition {
  x: number
  y: number
}

export interface ExecutionGraphNode {
  /** Stable for this run and attempt. */
  id: string
  /** Stable across runs; identifies the reusable node definition. */
  definitionId: string
  runId?: string
  blockId: string
  kind: ExecutionNodeKind
  title: string
  summary: string
  description: string
  status: ExecutionNodeStatus
  sequence: number
  attempt: number
  position: ExecutionNodePosition
  inputs: ExecutionPort[]
  outputs: ExecutionPort[]
  sourceStepIds: string[]
  startedAt?: number
  completedAt?: number
  durationMs?: number
  confidenceScore?: number
  riskScore: number
  riskLevel: ExecutionRiskLevel
  tool?: string
  target?: string
  recommendations: string[]
  data: Record<string, unknown>
}

export interface ExecutionGraphEdge {
  id: string
  source: string
  target: string
  sourcePort?: string
  targetPort?: string
  kind: ExecutionEdgeKind
  status: ExecutionEdgeStatus
  label?: string
  condition?: string
  payloadPreview?: string
  data?: Record<string, unknown>
}

export interface ExecutionGraphBlock {
  id: string
  /** Stable reusable block definition. */
  definitionId: string
  /** Schema/version of the reusable block definition. */
  version: number
  title: string
  description: string
  sequence: number
  nodeIds: string[]
  status: ExecutionNodeStatus
  collapsible: boolean
  position: ExecutionNodePosition
  width: number
  height: number
}

export interface ExecutionGraphSnapshot {
  id: string
  runId?: string
  generatedAt: number
  state: string
  isDemo: boolean
  visibleStepCount: number
  totalStepCount: number
  nodes: ExecutionGraphNode[]
  edges: ExecutionGraphEdge[]
  blocks: ExecutionGraphBlock[]
  world: { width: number; height: number }
}

export interface ExecutionGraphSelection {
  type: 'node' | 'edge' | 'block'
  id: string
}

export type ExecutionGraphFilter = 'all' | 'active' | 'decisions' | 'evidence'
