import type { AgentTool } from './tool'
import { genericIntent } from './intent'

export const workspaceTool: AgentTool = {
  name: 'workspace.tool.ts',
  description: 'Builds a workspace-scoped intent for project metadata operations.',
  createIntent: (args, call) => genericIntent('workspace', args, call),
}
