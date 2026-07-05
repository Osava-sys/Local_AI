import type { AgentTool } from './tool'
import { browserIntent } from './intent'

export const browserTool: AgentTool = {
  name: 'browser.tool.ts',
  description: 'Builds a high-risk browser automation intent. Human approval is required before execution.',
  createIntent: browserIntent,
}
