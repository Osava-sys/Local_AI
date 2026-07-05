import { create } from 'zustand'
import type { AgentRunStep, AgentState } from '@shared/types/agent.types'

const MAX_MEMORY_ENTRIES = 50
const MAX_ACTIONS = 5
const MAX_CHECKPOINTS = 25

export interface AgentMemoryEntry {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  createdAt: string
}

export interface AgentActionEntry {
  id: string
  tool: string
  target?: string
  status?: string
  result: string
  createdAt: string
}

export interface AgentRiskFindingView {
  id: string
  target?: string
  port?: number
  service?: string
  version?: string
  cveMatched: string[]
  riskScore: number
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  recommendation: string
  createdAt: string
}

export interface AgentCheckpoint {
  id: string
  progress: number
  currentStep: string
  estimatedTimeRemaining?: string
  createdAt: string
}

interface AgentStoreState {
  currentRunId: string | null
  state: AgentState | 'starting'
  steps: AgentRunStep[]
  error: string | null
  memory: AgentMemoryEntry[]
  recentActions: AgentActionEntry[]
  riskFindings: AgentRiskFindingView[]
  checkpoints: AgentCheckpoint[]
  setRun(runId: string | null): void
  setState(state: AgentStoreState['state']): void
  setError(error: string | null): void
  appendStep(step: AgentRunStep): void
  setSteps(steps: AgentRunStep[]): void
  clearSteps(): void
  remember(
    entry: Omit<AgentMemoryEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): void
  recordAction(
    entry: Omit<AgentActionEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): void
  upsertRiskFinding(
    finding: Omit<AgentRiskFindingView, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): void
  addCheckpoint(
    checkpoint: Omit<AgentCheckpoint, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): void
  resetSession(): void
}

export const useAgentStore = create<AgentStoreState>((set) => ({
  currentRunId: null,
  state: 'idle',
  steps: [],
  error: null,
  memory: [],
  recentActions: [],
  riskFindings: [],
  checkpoints: [],
  setRun: (runId) => set({ currentRunId: runId }),
  setState: (state) => set({ state }),
  setError: (error) => set({ error }),
  appendStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  setSteps: (steps) => set({ steps }),
  clearSteps: () => set({ steps: [] }),
  remember: (entry) =>
    set((state) => ({
      memory: [
        ...state.memory,
        {
          id: entry.id ?? crypto.randomUUID(),
          role: entry.role,
          content: entry.content,
          createdAt: entry.createdAt ?? new Date().toISOString(),
        },
      ].slice(-MAX_MEMORY_ENTRIES),
    })),
  recordAction: (entry) =>
    set((state) => ({
      recentActions: [
        ...state.recentActions,
        {
          id: entry.id ?? crypto.randomUUID(),
          tool: entry.tool,
          target: entry.target,
          status: entry.status,
          result: summarize(entry.result, 240),
          createdAt: entry.createdAt ?? new Date().toISOString(),
        },
      ].slice(-MAX_ACTIONS),
    })),
  upsertRiskFinding: (finding) =>
    set((state) => {
      const id =
        finding.id ??
        `${finding.target ?? 'target'}:${finding.port ?? 'port'}:${finding.service ?? 'service'}`
      const next: AgentRiskFindingView = {
        id,
        target: finding.target,
        port: finding.port,
        service: finding.service,
        version: finding.version,
        cveMatched: finding.cveMatched,
        riskScore: finding.riskScore,
        priority: finding.priority,
        recommendation: finding.recommendation,
        createdAt: finding.createdAt ?? new Date().toISOString(),
      }
      return {
        riskFindings: [next, ...state.riskFindings.filter((item) => item.id !== id)].sort(
          (a, b) => b.riskScore - a.riskScore
        ),
      }
    }),
  addCheckpoint: (checkpoint) =>
    set((state) => ({
      checkpoints: [
        ...state.checkpoints,
        {
          id: checkpoint.id ?? crypto.randomUUID(),
          progress: clampProgress(checkpoint.progress),
          currentStep: checkpoint.currentStep,
          estimatedTimeRemaining: checkpoint.estimatedTimeRemaining,
          createdAt: checkpoint.createdAt ?? new Date().toISOString(),
        },
      ].slice(-MAX_CHECKPOINTS),
    })),
  resetSession: () =>
    set({
      currentRunId: null,
      state: 'idle',
      steps: [],
      error: null,
      memory: [],
      recentActions: [],
      riskFindings: [],
      checkpoints: [],
    }),
}))

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function summarize(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 3)}...`
}
