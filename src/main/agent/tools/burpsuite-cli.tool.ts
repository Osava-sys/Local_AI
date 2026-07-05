import * as z from 'zod'
import type { AgentTool } from './tool'
import { shellSecurityIntent, targetFromUrl, validationErrorIntent } from './security-tool-helpers'

const BurpSuiteCliArgsSchema = z.object({
  target: z.string().url().max(2048),
  projectFile: z.string().max(1024).optional(),
  configFile: z.string().max(1024).optional(),
  command: z.enum(['scan', 'crawl']).default('scan'),
  timeoutMs: z.number().int().positive().optional(),
})

export const burpSuiteCliTool: AgentTool = {
  name: 'burpsuite-cli.tool.ts',
  description: 'Structured Burp Suite CLI/proxy automation intent. Critical risk; approval is required.',
  createIntent(args, call) {
    const parsed = BurpSuiteCliArgsSchema.safeParse(args)
    if (!parsed.success) return validationErrorIntent(call, 'burpsuite-cli.tool.ts', parsed)

    const commandArgs = [
      parsed.data.command,
      '--target',
      parsed.data.target,
      ...(parsed.data.projectFile ? ['--project-file', parsed.data.projectFile] : []),
      ...(parsed.data.configFile ? ['--config-file', parsed.data.configFile] : []),
    ]

    return shellSecurityIntent(call, 'burpsuite-cli', commandArgs, {
      target: targetFromUrl(parsed.data.target),
      timeoutMs: parsed.data.timeoutMs,
      risk: 'critical',
      maxConnections: 8,
      reason: `Structured Burp Suite ${parsed.data.command} for ${parsed.data.target}`,
    })
  },
}
