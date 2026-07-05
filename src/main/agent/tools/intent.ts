import type { ToolCall } from '@shared/types/agent.types'
import type {
  BrowserToolIntent,
  FilesystemToolIntent,
  GenericToolIntent,
  NetworkToolIntent,
  ShellToolIntent,
} from '@shared/types/sandbox.types'

function textArg(args: Record<string, unknown>, key: string, fallback = ''): string {
  const value = args[key]
  return typeof value === 'string' ? value : fallback
}

function numberArrayArg(args: Record<string, unknown>, key: string): number[] | undefined {
  const value = args[key]
  if (!Array.isArray(value)) return undefined
  return value.map(Number).filter(Number.isFinite)
}

function boolArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

export function shellIntent(args: Record<string, unknown>, call: ToolCall): ShellToolIntent {
  return {
    id: call.id,
    kind: 'shell',
    command: textArg(args, 'command'),
    args: Array.isArray(args['args']) ? args['args'].map(String) : undefined,
    cwd: textArg(args, 'cwd') || undefined,
    environment: typeof args['environment'] === 'object' && args['environment'] !== null
      ? Object.fromEntries(Object.entries(args['environment'] as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
      : undefined,
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: 'high',
  }
}

export function networkIntent(args: Record<string, unknown>, call: ToolCall): NetworkToolIntent {
  const scanType = textArg(args, 'scanType', 'version')
  return {
    id: call.id,
    kind: 'network',
    target: textArg(args, 'target'),
    ports: numberArrayArg(args, 'ports'),
    scanType: scanType === 'syn' || scanType === 'connect' || scanType === 'http' ? scanType : 'version',
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: 'high',
  }
}

export function filesystemIntent(args: Record<string, unknown>, call: ToolCall): FilesystemToolIntent {
  const mode = textArg(args, 'mode', 'read')
  return {
    id: call.id,
    kind: 'filesystem',
    path: textArg(args, 'path'),
    mode: mode === 'write' || mode === 'list' ? mode : 'read',
    content: textArg(args, 'content') || undefined,
    recursive: boolArg(args, 'recursive'),
    maxSizeMB: typeof args['maxSizeMB'] === 'number' ? args['maxSizeMB'] : 10,
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: mode === 'write' ? 'medium' : 'low',
  }
}

export function browserIntent(args: Record<string, unknown>, call: ToolCall): BrowserToolIntent {
  const action = textArg(args, 'action', 'open')
  return {
    id: call.id,
    kind: 'browser',
    url: textArg(args, 'url'),
    action: action === 'evaluate' || action === 'screenshot' ? action : 'open',
    script: textArg(args, 'script') || undefined,
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: 'critical',
  }
}

export function genericIntent(kind: GenericToolIntent['kind'], args: Record<string, unknown>, call: ToolCall): GenericToolIntent {
  return {
    id: call.id,
    kind,
    payload: args,
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: 'low',
  }
}
