import type { SandboxPolicy } from '@shared/types/sandbox.types'

export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  runner: 'child_process',
  workspaceRoot: '.',
  allowDocker: false,
  allowChildProcess: true,
  allowBrowserAutomation: false,
  allowOutboundNetwork: true,
  bindInterfaces: [],
  maxConnectionsPerScan: 64,
  maxOutputBytes: 1_048_576,
  maxFileSizeMB: 10,
  maxDirectoryDepth: 5,
  defaultTimeoutMs: 30000,
}

/** Fills any missing field of a partial policy from the defaults. */
export function normalizeSandboxPolicy(partial: Partial<SandboxPolicy> & Record<string, unknown>): SandboxPolicy {
  const snakeAliases: Partial<SandboxPolicy> = {
    allowOutboundNetwork: boolAlias(partial, 'allow_outbound_network'),
    bindInterfaces: stringArrayAlias(partial, 'bind_interfaces'),
    maxConnectionsPerScan: numberAlias(partial, 'max_connections_per_scan'),
  }

  return {
    ...DEFAULT_SANDBOX_POLICY,
    ...partial,
    ...definedOnly(snakeAliases),
  }
}

function boolAlias(source: Record<string, unknown>, key: string): boolean | undefined {
  return typeof source[key] === 'boolean' ? source[key] : undefined
}

function numberAlias(source: Record<string, unknown>, key: string): number | undefined {
  return typeof source[key] === 'number' ? source[key] : undefined
}

function stringArrayAlias(source: Record<string, unknown>, key: string): string[] | undefined {
  const value = source[key]
  return Array.isArray(value) ? value.map(String) : undefined
}

function definedOnly<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>
}
