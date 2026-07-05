import type { AgentTool } from './tool'
import { genericIntent } from './intent'

export const documentTool: AgentTool = {
  name: 'document.tool.ts',
  description: 'Builds a document/RAG intent. Execution is delegated to dedicated document services.',
  createIntent: (args, call) => genericIntent('document', args, call),
}
