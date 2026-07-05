import * as z from 'zod'
import type { AgentTool } from './tool'
import { normalizeHttpTarget, shellSecurityIntent, targetFromUrl, validationErrorIntent } from './security-tool-helpers'

const SqlmapArgsSchema = z.object({
  url: z.string().url().max(2048),
  method: z.enum(['GET', 'POST']).default('GET'),
  data: z.string().max(4096).optional(),
  cookie: z.string().max(4096).optional(),
  level: z.number().int().min(1).max(3).default(1),
  risk: z.number().int().min(1).max(2).default(1),
  technique: z.string().regex(/^[BEUSTQ]+$/).max(6).optional(),
  timeoutMs: z.number().int().positive().optional(),
})

export const sqlmapTool: AgentTool = {
  name: 'sqlmap.tool.ts',
  description: 'Structured SQLMap detection intent. Critical risk; approval is required before execution.',
  createIntent(args, call) {
    const parsed = SqlmapArgsSchema.safeParse(args)
    if (!parsed.success) return validationErrorIntent(call, 'sqlmap.tool.ts', parsed)

    const { url, normalized, note } = normalizeHttpTarget(parsed.data.url)

    const commandArgs = [
      '-u',
      url,
      '--batch',
      '--disable-coloring',
      '--method',
      parsed.data.method,
      '--level',
      String(parsed.data.level),
      '--risk',
      String(parsed.data.risk),
      '--timeout',
      '30',
      ...(parsed.data.data ? ['--data', parsed.data.data] : []),
      ...(parsed.data.cookie ? ['--cookie', parsed.data.cookie] : []),
      ...(parsed.data.technique ? ['--technique', parsed.data.technique] : []),
    ]

    return shellSecurityIntent(call, 'sqlmap', commandArgs, {
      target: targetFromUrl(url),
      timeoutMs: parsed.data.timeoutMs,
      risk: 'critical',
      maxConnections: 4,
      reason: `Structured sqlmap injection assessment for ${url}${normalized ? ` (${note})` : ''}`,
      notes: note ? [note] : undefined,
      requiresBinary: 'sqlmap',
    })
  },
}
