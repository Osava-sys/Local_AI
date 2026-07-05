import type { ToolCall } from '@shared/types/agent.types'
import type { ToolIntent, ToolResult } from '@shared/types/sandbox.types'

export interface AgentTool {
  name: string
  description: string
  createIntent(args: Record<string, unknown>, call: ToolCall): ToolIntent
}

export interface ToolExecution {
  call: ToolCall
  intent: ToolIntent
  result: ToolResult
}
