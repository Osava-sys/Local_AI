export type ToolIntentKind =
  | 'shell'
  | 'network'
  | 'filesystem'
  | 'browser'
  | 'document'
  | 'analysis'
  | 'rag'
  | 'workspace'

export interface BaseToolIntent {
  id: string
  kind: ToolIntentKind
  reason?: string
  timeoutMs?: number
  risk?: 'low' | 'medium' | 'high' | 'critical'
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
  mode: 'read' | 'write' | 'list'
  content?: string
  recursive?: boolean
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
  | ShellToolIntent
  | NetworkToolIntent
  | FilesystemToolIntent
  | BrowserToolIntent
  | GenericToolIntent

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
}
