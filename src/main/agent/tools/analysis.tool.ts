import type { AgentTool } from './tool'
import { genericIntent } from './intent'

export const analysisTool: AgentTool = {
  name: 'analysis.tool.ts',
  description: 'Builds a static analysis intent without direct code execution.',
  createIntent: (args, call) => genericIntent('analysis', args, call),
}
