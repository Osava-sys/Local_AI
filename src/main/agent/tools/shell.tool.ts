import type { AgentTool } from './tool'
import { shellIntent } from './intent'

export const shellTool: AgentTool = {
  name: 'shell.tool.ts',
  description: 'Builds a typed shell command intent. Execution is delegated to the sandbox executor.',
  createIntent: shellIntent,
}
