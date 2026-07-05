export type ToolIntentKind =
  'shell' | 'network' | 'filesystem' | 'browser' | 'document' | 'analysis' | 'rag' | 'workspace'

export interface BaseToolIntent {
  id: string
  kind: ToolIntentKind
  reason?: string
  timeoutMs?: number
  risk?: 'low' | 'medium' | 'high' | 'critical'
  /** Network target extracted by a structured tool so approval/sandbox policy can scope it. */
  networkTarget?: string
  /** Estimated concurrent connections this intent may create. */
  maxConnections?: number
  /** Requested network interface for tools that support interface binding. */
  bindInterface?: string
  /** Human-facing notes (e.g. a normalized target) surfaced in the result metadata. */
  notes?: string[]
  /** Executable that must be available before this intent can run/be approved. */
  requiresBinary?: string
  /** Files (e.g. a gobuster wordlist) that must exist in scope before running/approval. */
  requiresPaths?: string[]
}

export interface ShellToolIntent extends BaseToolIntent {
  kind: 'shell'
  command: string
  args?: string[]
  cwd?: string
  environment?: Record<string, string>
}

export interface NetworkToolIntent extends BaseToolIntent {
  kind: 'network'
  target: string
  ports?: number[]
  scanType?: 'connect' | 'syn' | 'version' | 'http'
}

export interface FilesystemToolIntent extends BaseToolIntent {
  kind: 'filesystem'
  path: string
  mode: 'read' | 'write' | 'list' | 'search'
  content?: string
  recursive?: boolean
  pattern?: string | string[]
  maxResults?: number
  maxSizeMB?: number
}

export interface BrowserToolIntent extends BaseToolIntent {
  kind: 'browser'
  url: string
  action: 'open' | 'evaluate' | 'screenshot'
  script?: string
}

export interface GenericToolIntent extends BaseToolIntent {
  kind: 'document' | 'analysis' | 'rag' | 'workspace'
  payload: Record<string, unknown>
}

export type ToolIntent =
  ShellToolIntent | NetworkToolIntent | FilesystemToolIntent | BrowserToolIntent | GenericToolIntent

export type ToolResultStatus = 'success' | 'error' | 'denied' | 'requires_approval' | 'timeout'

export interface ToolResult {
  id: string
  kind: ToolIntentKind
  status: ToolResultStatus
  stdout?: string
  stderr?: string
  exitCode?: number | null
  observation: string
  startedAt: string
  endedAt: string
  durationMs: number
  needsApproval?: boolean
  approvalReason?: string
  /** Whether stdout/stderr were truncated to respect the output byte limit. */
  truncated?: boolean
  /** Structured extras (e.g. parsed nmap ports, audit id). Never carries secrets. */
  metadata?: Record<string, unknown>
}

/** Runtime limits applied to every sandbox execution. Mirrors config/sandbox/limits.json. */
export interface SandboxLimits {
  defaultTimeoutMs: number
  httpRequestTimeoutMs: number
  networkScanTimeoutMs: number
  maxTimeoutMs: number
  maxOutputBytes: number
  maxFileSizeMB: number
  maxDirectoryDepth: number
  /** How long a pending human-approval request waits before auto-expiring. */
  approvalTimeoutMs: number
}

/** Sandbox capability + scope policy. Mirrors config/sandbox/policy.json. */
export interface SandboxPolicy {
  runner: string
  workspaceRoot: string
  allowDocker: boolean
  allowChildProcess: boolean
  allowBrowserAutomation: boolean
  allowOutboundNetwork: boolean
  bindInterfaces: string[]
  maxConnectionsPerScan: number
  maxOutputBytes: number
  maxFileSizeMB: number
  maxDirectoryDepth: number
  defaultTimeoutMs: number
}

/** A single port row parsed out of nmap textual output. */
export interface NmapPort {
  port: number
  protocol: 'tcp' | 'udp'
  state: string
  service: string
  version: string
}

export type NetworkExposure = 'localhost' | 'lan' | 'all_interfaces' | 'unknown'

/** A listening socket parsed from Windows `netstat -ano` output. */
export interface NetstatPort {
  protocol: 'tcp' | 'udp'
  localAddress: string
  port: number
  state: string
  pid: number
  exposure: NetworkExposure
}

/** A process row parsed from Windows `tasklist` output. */
export interface TasklistProcess {
  imageName: string
  pid: number
}

export interface TcpPortProbeResult {
  port: number
  status: 'open' | 'closed' | 'timeout'
  durationMs: number
}
