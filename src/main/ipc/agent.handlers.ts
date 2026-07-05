import type { IpcMainInvokeEvent } from 'electron'
import type { Result } from '@shared/types/ipc.types'
import type { AgentRun } from '@shared/types/agent.types'
import { AgentGetPayloadSchema, AgentStartPayloadSchema, AgentStopPayloadSchema } from '@shared/validation/agent.schema'
import { getDb } from '../storage/db-client'
import { AgentOrchestrator } from '../agent/orchestrator'

let orchestrator: AgentOrchestrator | null = null

function getOrchestrator(event: IpcMainInvokeEvent): AgentOrchestrator {
  if (!orchestrator) orchestrator = new AgentOrchestrator(getDb(), { webContents: event.sender })
  return orchestrator
}

export async function handleAgentStart(event: IpcMainInvokeEvent, payload: unknown): Promise<Result<{ runId: string }>> {
  const parsed = AgentStartPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  try {
    const { workspaceId, prompt, options } = parsed.data
    const runId = await getOrchestrator(event).startRun(workspaceId, prompt, options)
    return { ok: true, value: { runId } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleAgentStop(event: IpcMainInvokeEvent, payload: unknown): Promise<Result<void>> {
  const parsed = AgentStopPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  try {
    await getOrchestrator(event).stopRun(parsed.data.runId)
    return { ok: true, value: undefined }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleAgentGet(event: IpcMainInvokeEvent, payload: unknown): Promise<Result<AgentRun>> {
  const parsed = AgentGetPayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  try {
    const run = await getOrchestrator(event).getRunStatus(parsed.data.runId)
    return { ok: true, value: run }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
