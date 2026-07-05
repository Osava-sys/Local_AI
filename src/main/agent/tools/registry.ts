import type { ToolCall } from '@shared/types/agent.types'
import type { ToolResult } from '@shared/types/sandbox.types'
import { SandboxExecutor } from '../../sandbox/sandbox-executor'
import { analysisTool } from './analysis.tool'
import { browserTool } from './browser.tool'
import { documentTool } from './document.tool'
import { filesystemTool } from './filesystem.tool'
import { networkTool } from './network.tool'
import { ragTool } from './rag.tool'
import { shellTool } from './shell.tool'
import type { AgentTool, ToolExecution } from './tool'
import { workspaceTool } from './workspace.tool'

function aliasesFor(name: string): string[] {
  const bare = name.replace(/\.tool\.ts$/, '').replace(/\.ts$/, '')
  return [name, bare, `${bare}.tool`, `${bare}.tool.ts`]
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>()

  constructor(private readonly sandbox = new SandboxExecutor()) {
    this.registerMany([
      shellTool,
      networkTool,
      filesystemTool,
      browserTool,
      documentTool,
      analysisTool,
      ragTool,
      workspaceTool,
    ])
  }

  register(tool: AgentTool): void {
    for (const alias of aliasesFor(tool.name)) {
      this.tools.set(alias.toLowerCase(), tool)
    }
  }

  registerMany(tools: AgentTool[]): void {
    tools.forEach(tool => this.register(tool))
  }

  list(): AgentTool[] {
    return Array.from(new Set(this.tools.values()))
  }

  has(name: string): boolean {
    return this.tools.has(name.toLowerCase())
  }

  async execute(call: ToolCall): Promise<ToolExecution> {
    const tool = this.tools.get(call.name.toLowerCase())
    if (!tool) {
      const startedAt = new Date().toISOString()
      const result: ToolResult = {
        id: call.id,
        kind: 'analysis',
        status: 'error',
        observation: `Unknown tool: ${call.name}`,
        startedAt,
        endedAt: startedAt,
        durationMs: 0,
        exitCode: null,
      }
      return {
        call: { ...call, status: 'error' },
        intent: { id: call.id, kind: 'analysis', payload: call.args },
        result,
      }
    }

    const intent = tool.createIntent(call.args, call)
    const result = await this.sandbox.execute(intent)
    const status = result.status === 'success'
      ? 'done'
      : result.status === 'requires_approval'
        ? 'requires_approval'
        : 'error'

    return {
      call: { ...call, status },
      intent,
      result,
    }
  }
}
