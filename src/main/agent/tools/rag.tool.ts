import type { AgentTool } from './tool'
import { genericIntent } from './intent'

export const ragTool: AgentTool = {
  name: 'rag.tool.ts',
  description: 'Builds a retrieval intent for local indexed context.',
  createIntent: (args, call) => genericIntent('rag', args, call),
}
