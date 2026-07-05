import * as z from 'zod'

export const SandboxLimitsSchema = z.object({
  defaultTimeoutMs: z.number().int().positive(),
  httpRequestTimeoutMs: z.number().int().positive(),
  networkScanTimeoutMs: z.number().int().positive(),
  maxTimeoutMs: z.number().int().positive(),
  maxOutputBytes: z.number().int().positive(),
  maxFileSizeMB: z.number().int().positive(),
  maxDirectoryDepth: z.number().int().positive(),
})

export const SandboxPolicySchema = z.object({
  runner: z.string().min(1),
  workspaceRoot: z.string().min(1),
  allowDocker: z.boolean(),
  allowChildProcess: z.boolean(),
  allowBrowserAutomation: z.boolean(),
  allowOutboundNetwork: z.boolean().optional(),
  allow_outbound_network: z.boolean().optional(),
  bindInterfaces: z.array(z.string()).optional(),
  bind_interfaces: z.array(z.string()).optional(),
  maxConnectionsPerScan: z.number().int().positive().optional(),
  max_connections_per_scan: z.number().int().positive().optional(),
  maxOutputBytes: z.number().int().positive(),
  maxFileSizeMB: z.number().int().positive(),
  maxDirectoryDepth: z.number().int().positive(),
  defaultTimeoutMs: z.number().int().positive(),
})
