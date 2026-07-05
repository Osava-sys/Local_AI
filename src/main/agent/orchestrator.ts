import type { WebContents } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import type { AgentRun, AgentState, ReactLoopOptions, ReasoningStep } from '@shared/types/agent.types'
import type { ModelConfigInput, ModelProvider } from '@shared/types/model.types'
import { LlamaCppHttpProvider } from '../models/local-http.provider'
import { getActiveRuntimeModelConfig } from '../models/model-runtime'
import { AgentRunsRepository } from '../storage/repositories/agent-runs.repository'
import { AgentRunStateRepository } from '../storage/repositories/agent-run-state.repository'
import { AgentRunStepsRepository } from '../storage/repositories/agent-run-steps.repository'
import { MemoryManager } from './memory-manager'
import { runReactLoop } from './react-loop'
import { ToolRegistry } from './tools/registry'

export interface AgentOrchestratorOptions {
  provider?: ModelProvider
  tools?: ToolRegistry
  memory?: MemoryManager
  modelConfig?: ModelConfigInput
  webContents?: WebContents
}

interface ActiveRun {
  controller: AbortController
  workspaceId: string
}

const DEFAULT_RUN_OPTIONS: ReactLoopOptions = {
  maxSteps: 10,
  timeoutPerStep: 30000,
  totalTimeout: 600000,
  stopConditions: ['FINAL'],
}

export class AgentOrchestrator {
  private readonly provider: ModelProvider
  private readonly tools: ToolRegistry
  private readonly memory: MemoryManager
  private readonly runsRepo: AgentRunsRepository
  private readonly stepsRepo: AgentRunStepsRepository
  private readonly stateRepo: AgentRunStateRepository
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly webContents?: WebContents
  private readonly modelConfig?: ModelConfigInput

  constructor(db: BetterSqlite3.Database, options: AgentOrchestratorOptions = {}) {
    this.provider = options.provider ?? new LlamaCppHttpProvider()
    this.tools = options.tools ?? new ToolRegistry()
    this.memory = options.memory ?? new MemoryManager()
    this.webContents = options.webContents
    this.modelConfig = options.modelConfig

    this.runsRepo = new AgentRunsRepository(db)
    this.stepsRepo = new AgentRunStepsRepository(db)
    this.stateRepo = new AgentRunStateRepository(db)
  }

  async startRun(
    workspaceId: string,
    prompt: string,
    options?: Partial<ReactLoopOptions>,
  ): Promise<string> {
    const runId = crypto.randomUUID()
    const controller = new AbortController()
    const modelConfig = this.resolveModelConfig()
    const modelName = modelConfig.modelName

    this.runsRepo.create(runId, modelName)
    this.activeRuns.set(runId, { controller, workspaceId })
    this.emitState(runId, 'running')

    void this.executeRun(runId, workspaceId, prompt, { ...DEFAULT_RUN_OPTIONS, ...options }, controller, modelConfig)

    return runId
  }

  async stopRun(runId: string): Promise<void> {
    const active = this.activeRuns.get(runId)
    if (active) {
      active.controller.abort()
      this.activeRuns.delete(runId)
    }
    this.runsRepo.updateState(runId, 'paused')
    this.emitState(runId, 'paused')
  }

  async getRunStatus(runId: string): Promise<AgentRun> {
    const record = this.runsRepo.findById(runId)
    if (!record) throw new Error(`Agent run not found: ${runId}`)
    const snapshot = this.stateRepo.get<{ workspaceId?: string; steps?: ReasoningStep[] }>(runId)
    const persistedSteps = this.stepsRepo.listByRunId(runId)

    return {
      id: record.id,
      workspaceId: snapshot?.workspaceId ?? 'default',
      state: record.state,
      status: toPublicStatus(record.state),
      steps: snapshot?.steps ?? persistedSteps.map(step => ({
        type: step.type === 'thought' ? 'reason' : step.type === 'action' ? 'act' : 'observe',
        content: step.content,
        toolCall: step.toolCall,
      })),
      model: record.model ?? undefined,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    }
  }

  private async executeRun(
    runId: string,
    workspaceId: string,
    prompt: string,
    options: ReactLoopOptions,
    controller: AbortController,
    modelConfig: ModelConfigInput,
  ): Promise<void> {
    const steps: ReasoningStep[] = []
    this.memory.clear()

    try {
      await this.provider.init(modelConfig)

      for await (const step of runReactLoop(prompt, this.tools, this.memory, {
        ...options,
        provider: this.provider,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break

        steps.push(step)
        const persistedStep = this.stepsRepo.append(runId, step)
        this.stateRepo.save(runId, { workspaceId, steps })
        this.emitStep({ ...persistedStep, metadata: step.metadata, observation: step.observation })

        if (step.toolCall?.status === 'requires_approval') {
          this.runsRepo.updateState(runId, 'awaiting_approval')
          this.emitState(runId, 'awaiting_approval')
          return
        }
      }

      const finalState: AgentState = controller.signal.aborted ? 'paused' : 'done'
      this.runsRepo.updateState(runId, finalState)
      this.emitState(runId, finalState)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.runsRepo.updateState(runId, 'error')
      this.emitError(runId, message)
      this.emitState(runId, 'error')
    } finally {
      this.activeRuns.delete(runId)
    }
  }

  private emitStep(step: unknown): void {
    this.webContents?.send('agent:stepAdded', step)
  }

  private emitState(runId: string, state: AgentState): void {
    this.webContents?.send('agent:stateChanged', { runId, state })
  }

  private emitError(runId: string, error: string): void {
    this.webContents?.send('agent:error', { runId, error })
  }

  private resolveModelConfig(): ModelConfigInput {
    return this.modelConfig ?? getActiveRuntimeModelConfig() ?? {
      host: process.env['NEXUS_MODEL_HOST'] ?? 'http://127.0.0.1:8080/v1/chat/completions',
      modelName: process.env['NEXUS_MODEL_NAME'] ?? 'qwen3.5-9b-q8_0.gguf',
    }
  }
}

function toPublicStatus(state: AgentState): AgentRun['status'] {
  if (state === 'done') return 'completed'
  if (state === 'error') return 'failed'
  if (state === 'paused' || state === 'awaiting_approval') return 'paused'
  return 'running'
}
