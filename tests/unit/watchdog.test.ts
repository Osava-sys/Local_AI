import { describe, expect, it } from 'vitest'
import type { SandboxLimits } from '@shared/types/sandbox.types'
import { resolveWatchdogTimeout, watchdogTimeoutObservation } from '../../src/main/sandbox/watchdog'

const limits: SandboxLimits = {
  defaultTimeoutMs: 30000,
  httpRequestTimeoutMs: 30000,
  networkScanTimeoutMs: 300000,
  maxTimeoutMs: 300000,
  maxOutputBytes: 1024,
  maxFileSizeMB: 10,
  maxDirectoryDepth: 5,
}

describe('sandbox watchdog', () => {
  it('uses network scan timeout for network intents and security CLIs', () => {
    expect(resolveWatchdogTimeout({ id: 'n', kind: 'network', target: '127.0.0.1' }, limits)).toBe(300000)
    expect(resolveWatchdogTimeout({ id: 's', kind: 'shell', command: 'nmap' }, limits)).toBe(300000)
  })

  it('uses HTTP timeout for simple HTTP command helpers', () => {
    expect(resolveWatchdogTimeout({ id: 's', kind: 'shell', command: 'curl' }, limits)).toBe(30000)
  })

  it('clamps requested timeouts to maxTimeoutMs and emits a clear message', () => {
    expect(resolveWatchdogTimeout({ id: 's', kind: 'shell', command: 'nmap', timeoutMs: 999999 }, limits)).toBe(300000)
    expect(watchdogTimeoutObservation(300000)).toContain('Watchdog')
  })
})
