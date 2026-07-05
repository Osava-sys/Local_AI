import * as z from 'zod'
import type { AgentTool } from './tool'
import { genericIntent } from './intent'
import { validationErrorIntent } from './security-tool-helpers'

const ParserArgsSchema = z.object({
  text: z.string().min(1).max(256000),
  source: z.string().max(512).optional(),
})

export const parserTool: AgentTool = {
  name: 'parser.tool.ts',
  description: 'Parses raw security logs into structured entities before the next reasoning step.',
  createIntent(args, call) {
    const parsed = ParserArgsSchema.safeParse(args)
    if (!parsed.success) return validationErrorIntent(call, 'parser.tool.ts', parsed)
    return genericIntent('analysis', { operation: 'parse_security_log', ...parsed.data }, call)
  },
}
