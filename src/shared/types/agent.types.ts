/** États du cycle de vie d'un run agent. */
export type AgentState =
  | 'idle'
  | 'planning'
  | 'awaiting_approval'
  | 'running'
  | 'done'
  | 'error'
  | 'paused'
  | 'blocked'

/** Why the ReAct loop stopped. Lets the orchestrator pick a truthful final state. */
export type RunStopReason =
  | 'completed'
  | 'no_tool'
  | 'max_steps'
  | 'timeout'
  | 'blocked'
  | 'error'

/** Un appel d'outil demandé par l'agent dans la boucle RAO. */
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'running' | 'done' | 'error' | 'requires_approval'
}

/** Une étape atomique dans la boucle Reason-Act-Observe. */
export interface AgentRunStep {
  id?: string
  runId?: string
  type: 'thought' | 'action' | 'observation' | 'reason' | 'act' | 'observe'
  content: string
  toolCall?: ToolCall
  observation?: string
  metadata?: {
    tokensUsed: number
    durationMs: number
    confidenceScore: number
  }
  timestamp: number
  createdAt?: string
}

export interface ReasoningStep {
  type: 'reason' | 'act' | 'observe'
  content: string
  toolCall?: ToolCall
  observation?: string
  metadata?: {
    tokensUsed: number
    durationMs: number
    confidenceScore: number
  }
  /** Set on a terminal step to tell the orchestrator why the loop stopped. */
  stopReason?: RunStopReason
}

export interface ReactLoopOptions {
  maxSteps: number
  timeoutPerStep: number
  totalTimeout: number
  stopConditions?: string[]
}

export interface AgentRun {
  id: string
  workspaceId: string
  userId?: string
  state: AgentState
  status: 'running' | 'paused' | 'completed' | 'failed'
  steps: ReasoningStep[]
  model?: string
  createdAt: Date
  updatedAt: Date
}

export interface AgentStartPayload {
  workspaceId: string
  prompt: string
  options?: Partial<ReactLoopOptions>
}

export interface AgentStopPayload {
  runId: string
}

export interface AgentGetPayload {
  runId: string
}
