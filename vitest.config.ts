import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(rootDir, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    // Only files that contain real tests are listed here. The remaining
    // 0-byte stubs under tests/ are an unimplemented backlog; add them back
    // once they contain suites (an empty file makes Vitest fail the run).
    include: [
      'tests/unit/agent-loop.test.ts',
      'tests/unit/approval-gate.test.ts',
      'tests/unit/approval-policy-source.test.ts',
      'tests/unit/sandbox-policy.test.ts',
      'tests/unit/tool-intent-boundary.test.ts',
      'tests/unit/browser-sandbox-routing.test.ts',
    ],
  },
})
