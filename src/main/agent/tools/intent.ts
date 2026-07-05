import type { ToolCall } from '@shared/types/agent.types'
import type {
  BrowserToolIntent,
  FilesystemToolIntent,
  GenericToolIntent,
  NetworkToolIntent,
  ShellToolIntent,
  ToolIntent,
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

function stringArrayOrStringArg(
  args: Record<string, unknown>,
  key: string
): string | string[] | undefined {
  const value = args[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  return undefined
}

export function shellIntent(args: Record<string, unknown>, call: ToolCall): ToolIntent {
  const normalizedCommand = normalizeShellCommandArgs(
    textArg(args, 'command'),
    Array.isArray(args['args']) ? args['args'].map(String) : undefined
  )
  const intent: ShellToolIntent = {
    id: call.id,
    kind: 'shell',
    command: normalizedCommand.command,
    args: normalizedCommand.args,
    cwd: textArg(args, 'cwd') || undefined,
    environment:
      typeof args['environment'] === 'object' && args['environment'] !== null
        ? Object.fromEntries(
            Object.entries(args['environment'] as Record<string, unknown>).map(([key, value]) => [
              key,
              String(value),
            ])
          )
        : undefined,
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: 'high',
  }

  return safePowerShellTcpProbeIntent(intent) ?? intent
}

export function networkIntent(args: Record<string, unknown>, call: ToolCall): NetworkToolIntent {
  return {
    id: call.id,
    kind: 'network',
    target: textArg(args, 'target'),
    ports: numberArrayArg(args, 'ports'),
    scanType: normalizeNetworkScanType(textArg(args, 'scanType', 'version')),
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: 'high',
    networkTarget: textArg(args, 'target'),
    maxConnections: numberArrayArg(args, 'ports')?.length,
  }
}

function normalizeNetworkScanType(scanType: string): NonNullable<NetworkToolIntent['scanType']> {
  const normalized = scanType.toLowerCase()
  if (
    normalized === 'connect' ||
    normalized === 'connectivity' ||
    normalized === 'tcp' ||
    normalized === 'tcp_connect'
  ) {
    return 'connect'
  }
  if (normalized === 'syn') return 'syn'
  if (normalized === 'http') return 'http'
  return 'version'
}

function normalizeShellCommandArgs(
  command: string,
  args: string[] | undefined
): { command: string; args?: string[] } {
  if (args !== undefined || !/\s/.test(command.trim())) return { command, args }

  const parts = splitCommandLine(command)
  if (parts.length <= 1) return { command, args }
  return { command: parts[0], args: parts.slice(1) }
}

function splitCommandLine(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if ((char === '"' || char === "'") && quote === null) {
      quote = char
      continue
    }
    if (char === quote) {
      quote = null
      continue
    }
    if (/\s/.test(char) && quote === null) {
      if (current) {
        parts.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) parts.push(current)
  return parts
}

function safePowerShellTcpProbeIntent(intent: ShellToolIntent): NetworkToolIntent | null {
  const command = baseCommand(intent.command)
  if (command !== 'powershell' && command !== 'pwsh') return null

  const commandText = extractPowerShellCommandText(intent.args ?? [])
  if (!commandText) return null
  if (!isSafeTestNetConnection(commandText)) return null

  const target = matchOption(commandText, 'ComputerName') ?? matchOption(commandText, 'TargetName')
  const portText = matchOption(commandText, 'Port')
  const port = Number(portText)
  if (!target || !Number.isInteger(port) || port < 1 || port > 65535) return null

  return {
    id: intent.id,
    kind: 'network',
    target,
    ports: [port],
    scanType: 'connect',
    timeoutMs: intent.timeoutMs,
    risk: 'high',
    networkTarget: target,
    maxConnections: 1,
    notes: [
      'Converted safe PowerShell Test-NetConnection request to sandbox TCP probe; PowerShell was not executed.',
    ],
  }
}

function extractPowerShellCommandText(args: string[]): string | null {
  const commandIndex = args.findIndex((arg) => /^-(?:command|c)$/i.test(arg))
  if (commandIndex === -1) return null
  const commandParts = args.slice(commandIndex + 1)
  return commandParts.length > 0 ? commandParts.join(' ').trim() : null
}

function isSafeTestNetConnection(commandText: string): boolean {
  if (!/\bTest-NetConnection\b/i.test(commandText)) return false
  if (/[;&<>]|\|\|/.test(commandText)) return false
  if (
    /\b(?:Invoke-Expression|iex|Invoke-WebRequest|iwr|DownloadString|Start-Process|New-Object)\b/i.test(
      commandText
    )
  ) {
    return false
  }

  const segments = commandText
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (segments.length === 0 || !/^Test-NetConnection\b/i.test(segments[0])) return false
  return segments.slice(1).every((segment) => /^Select-Object\b[\w\s,.-]*$/i.test(segment))
}

function matchOption(commandText: string, option: string): string | null {
  const quoted = new RegExp(`-${option}\\s+["']([^"']+)["']`, 'i').exec(commandText)
  if (quoted) return quoted[1]
  return new RegExp(`-${option}\\s+([^\\s|]+)`, 'i').exec(commandText)?.[1] ?? null
}

function baseCommand(command: string): string {
  return (command.split(/[\\/]/).pop() ?? command).toLowerCase().replace(/\.exe$/, '')
}

export function filesystemIntent(
  args: Record<string, unknown>,
  call: ToolCall
): FilesystemToolIntent {
  const mode = textArg(args, 'mode', 'read')
  const normalizedMode = mode === 'write' || mode === 'list' || mode === 'search' ? mode : 'read'
  return {
    id: call.id,
    kind: 'filesystem',
    path: textArg(args, 'path'),
    mode: normalizedMode,
    content: textArg(args, 'content') || undefined,
    recursive: boolArg(args, 'recursive'),
    pattern: stringArrayOrStringArg(args, 'pattern'),
    maxResults: typeof args['maxResults'] === 'number' ? args['maxResults'] : undefined,
    maxSizeMB: typeof args['maxSizeMB'] === 'number' ? args['maxSizeMB'] : 10,
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: normalizedMode === 'write' ? 'medium' : 'low',
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

export function genericIntent(
  kind: GenericToolIntent['kind'],
  args: Record<string, unknown>,
  call: ToolCall
): GenericToolIntent {
  return {
    id: call.id,
    kind,
    payload: args,
    timeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30000,
    risk: 'low',
  }
}
