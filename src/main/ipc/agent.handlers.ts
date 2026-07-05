import type { IpcMainInvokeEvent } from 'electron'
import type { Result } from '@shared/types/ipc.types'
import type { AgentRun } from '@shared/types/agent.types'
import { AgentGetPayloadSchema, AgentStartPayloadSchema, AgentStopPayloadSchema } from '@shared/validation/agent.schema'
import { getDb } from '../storage/db-client'
import { AgentOrchestrator } from '../agent/orchestrator'
import { ToolRegistry } from '../agent/tools/registry'
import { SandboxExecutor } from '../sandbox/sandbox-executor'
import { ApprovalGate } from '../sandbox/approval-gate'
import { ChildProcessRunner } from '../sandbox/child-runner'
import { createAuditSink } from '../sandbox/audit'
import { ApprovalCoordinator } from '../approvals/approval-coordinator'
import { getApprovalService, getApprovalTimeouts } from '../approvals/approval-container'
import { SandboxAuditRepository } from '../storage/repositories/sandbox-audit.repository'

let orchestrator: AgentOrchestrator | null = null

/**
 * Builds the full sandbox pipeline for a run: the executor evaluates policy and
 * audits every intent, and the coordinator routes escalations through the shared
 * human-approval queue before anything runs.
 */
function buildToolRegistry(): ToolRegistry {
  const auditRepo = new SandboxAuditRepository(getDb())
  const auditSink = createAuditSink(entry => auditRepo.append(entry))
  const executor = new SandboxExecutor(new ApprovalGate(), new ChildProcessRunner(), auditSink)
  const coordinator = new ApprovalCoordinator(executor, getApprovalService(), getApprovalTimeouts())
  return new ToolRegistry(coordinator)
}

function getOrchestrator(event: IpcMainInvokeEvent): AgentOrchestrator {
  if (!orchestrator) {
    orchestrator = new AgentOrchestrator(getDb(), { webContents: event.sender, tools: buildToolRegistry() })
  }
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
