import * as z from 'zod'
import type { AgentTool } from './tool'
import { shellSecurityIntent, uniqueNumbers, validationErrorIntent } from './security-tool-helpers'

const NmapArgsSchema = z.object({
  target: z.string().min(1).max(512),
  ports: z.array(z.number().int().min(1).max(65535)).max(512).optional(),
  scanType: z.enum(['connect', 'syn', 'version', 'ping']).default('version'),
  scripts: z.array(z.string().regex(/^[A-Za-z0-9_-]+$/)).max(10).optional(),
  timing: z.enum(['T2', 'T3', 'T4']).default('T3'),
  interfaceName: z.string().regex(/^[A-Za-z0-9_.:-]+$/).optional(),
  timeoutMs: z.number().int().positive().optional(),
})

export const nmapTool: AgentTool = {
  name: 'nmap.tool.ts',
  description: 'Structured Nmap scan intent. Prefer this over shell.tool.ts for port/service discovery.',
  createIntent(args, call) {
    const parsed = NmapArgsSchema.safeParse(args)
    if (!parsed.success) return validationErrorIntent(call, 'nmap.tool.ts', parsed)

    const ports = uniqueNumbers(parsed.data.ports)
    const flags = scanFlags(parsed.data.scanType)
    const commandArgs = [
      ...flags,
      `-${parsed.data.timing}`,
      '--max-retries',
      '2',
      ...(ports?.length ? ['-p', ports.join(',')] : []),
      ...(parsed.data.scripts?.length ? ['--script', parsed.data.scripts.join(',')] : []),
      ...(parsed.data.interfaceName ? ['-e', parsed.data.interfaceName] : []),
      parsed.data.target,
    ]

    return shellSecurityIntent(call, 'nmap', commandArgs, {
      target: parsed.data.target,
      timeoutMs: parsed.data.timeoutMs,
      risk: parsed.data.scanType === 'syn' || parsed.data.scripts?.length ? 'high' : 'medium',
      maxConnections: ports?.length ?? 32,
      bindInterface: parsed.data.interfaceName,
      reason: `Structured nmap ${parsed.data.scanType} scan for ${parsed.data.target}`,
    })
  },
}

function scanFlags(scanType: z.infer<typeof NmapArgsSchema>['scanType']): string[] {
  if (scanType === 'connect') return ['-sT']
  if (scanType === 'syn') return ['-sS']
  if (scanType === 'ping') return ['-sn']
  return ['-sV']
}
