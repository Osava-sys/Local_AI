import * as z from 'zod'

export const ReactLoopOptionsSchema = z.object({
  maxSteps: z.number().int().min(1).max(50).optional(),
  timeoutPerStep: z.number().int().min(1000).max(300000).optional(),
  totalTimeout: z.number().int().min(1000).max(3600000).optional(),
  stopConditions: z.array(z.string().min(1).max(256)).optional(),
})

export const AgentStartPayloadSchema = z.object({
  workspaceId: z.string().min(1).max(256),
  prompt: z.string().min(1).max(64000),
  options: ReactLoopOptionsSchema.optional(),
})

export const AgentStopPayloadSchema = z.object({
  runId: z.string().uuid(),
})

export const AgentGetPayloadSchema = z.object({
  runId: z.string().uuid(),
})
