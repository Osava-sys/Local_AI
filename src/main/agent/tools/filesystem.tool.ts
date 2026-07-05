import type { AgentTool } from './tool'
import { filesystemIntent } from './intent'

export const filesystemTool: AgentTool = {
  name: 'filesystem.tool.ts',
  description: 'Builds a typed filesystem intent scoped by sandbox policy.',
  createIntent: filesystemIntent,
}
