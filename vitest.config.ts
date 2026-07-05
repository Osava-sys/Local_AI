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
      'tests/unit/nmap-parser.test.ts',
      'tests/unit/network-scope.test.ts',
      'tests/unit/filesystem-scope.test.ts',
      'tests/unit/approval-flow.test.ts',
      'tests/unit/sandbox-runners.test.ts',
      'tests/unit/netstat-parser.test.ts',
      'tests/unit/windows-version-parser.test.ts',
      'tests/unit/tasklist-parser.test.ts',
      'tests/unit/network-fallback.test.ts',
      'tests/unit/security-tools.test.ts',
      'tests/unit/parser-tool.test.ts',
      'tests/unit/parser-tool-boundary.test.ts',
      'tests/unit/session-memory.test.ts',
      'tests/unit/watchdog.test.ts',
      'tests/unit/tool-availability.test.ts',
      'tests/unit/gobuster-tool.test.ts',
      'tests/unit/react-loop.test.ts',
      'tests/unit/curl-parser.test.ts',
      'tests/integration/sandbox-runner.test.ts',
    ],
  },
})
