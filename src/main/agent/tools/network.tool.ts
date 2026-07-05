import type { AgentTool } from './tool'
import { networkIntent } from './intent'

export const networkTool: AgentTool = {
  name: 'network.tool.ts',
  description: 'Builds a typed network scan intent. Execution is delegated to the sandbox executor.',
  createIntent: networkIntent,
}
