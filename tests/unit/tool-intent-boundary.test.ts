import { describe, it, expect } from 'vitest'
import type { ToolCall } from '@shared/types/agent.types'
import {
  browserIntent,
  filesystemIntent,
  genericIntent,
  networkIntent,
  shellIntent,
} from '../../src/main/agent/tools/intent'

const call: ToolCall = { id: 'call-1', name: 'x', args: {}, status: 'pending' }

describe('intent builders — boundary and defaulting behaviour', () => {
  describe('shellIntent', () => {
    it('always tags shell intents as high risk with a default timeout', () => {
      const intent = shellIntent({ command: 'ls' }, call)
      expect(intent.kind).toBe('shell')
      expect(intent.risk).toBe('high')
      expect(intent.timeoutMs).toBe(30000)
      expect(intent.id).toBe(call.id)
    })

    it('coerces args to strings and drops non-array args', () => {
      const intent = shellIntent({ command: 'echo', args: [1, 'two', true] }, call)
      expect(intent.args).toEqual(['1', 'two', 'true'])
      const noArgs = shellIntent({ command: 'echo', args: 'not-an-array' }, call)
      expect(noArgs.args).toBeUndefined()
    })

    it('splits a simple one-line command when args are omitted', () => {
      const intent = shellIntent({ command: 'netstat -ano' }, call)
      expect(intent.kind).toBe('shell')
      if (intent.kind !== 'shell') throw new Error('expected shell intent')
      expect(intent.command).toBe('netstat')
      expect(intent.args).toEqual(['-ano'])
    })

    it('converts safe local PowerShell Test-NetConnection into a network probe intent', () => {
      const intent = shellIntent(
        {
          command: 'powershell',
          args: [
            '-Command',
            'Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Detailed | Select-Object TcpTestSucceeded, TcpTestRemotePort',
          ],
          timeoutMs: 15000,
        },
        call
      )

      expect(intent.kind).toBe('network')
      if (intent.kind !== 'network') throw new Error('expected network intent')
      expect(intent.target).toBe('127.0.0.1')
      expect(intent.ports).toEqual([5432])
      expect(intent.scanType).toBe('connect')
      expect(intent.maxConnections).toBe(1)
      expect(intent.notes?.[0]).toMatch(/PowerShell was not executed/)
    })

    it('does not convert complex PowerShell command strings', () => {
      const intent = shellIntent(
        {
          command: 'powershell',
          args: [
            '-Command',
            'Test-NetConnection -ComputerName 127.0.0.1 -Port 5432; Remove-Item x',
          ],
        },
        call
      )

      expect(intent.kind).toBe('shell')
    })
  })

  describe('networkIntent', () => {
    it('falls back to the version scan for unknown scan types', () => {
      expect(networkIntent({ target: 'localhost', scanType: 'evil' }, call).scanType).toBe(
        'version'
      )
      expect(networkIntent({ target: 'localhost' }, call).scanType).toBe('version')
    })

    it('preserves recognised scan types and filters non-finite ports', () => {
      expect(networkIntent({ target: 'localhost', scanType: 'syn' }, call).scanType).toBe('syn')
      expect(networkIntent({ target: 'localhost', scanType: 'connectivity' }, call).scanType).toBe(
        'connect'
      )
      const intent = networkIntent({ target: 'localhost', ports: [80, 'x', 443, NaN] }, call)
      expect(intent.ports).toEqual([80, 443])
      expect(intent.risk).toBe('high')
      expect(intent.networkTarget).toBe('localhost')
      expect(intent.maxConnections).toBe(2)
    })
  })

  describe('filesystemIntent', () => {
    it('defaults an unknown mode to read (least privilege)', () => {
      expect(filesystemIntent({ path: '/tmp/x', mode: 'delete' }, call).mode).toBe('read')
    })

    it('raises risk to medium only for writes', () => {
      expect(filesystemIntent({ path: '/tmp/x', mode: 'write' }, call).risk).toBe('medium')
      expect(filesystemIntent({ path: '/tmp/x', mode: 'read' }, call).risk).toBe('low')
      expect(filesystemIntent({ path: '/tmp/x', mode: 'list' }, call).risk).toBe('low')
    })

    it('supports read-only search mode with filename patterns', () => {
      const intent = filesystemIntent(
        {
          path: '.',
          mode: 'search',
          pattern: ['docker-compose.yml', '*.conf'],
          recursive: true,
          maxResults: 25,
        },
        call
      )

      expect(intent.mode).toBe('search')
      expect(intent.risk).toBe('low')
      expect(intent.pattern).toEqual(['docker-compose.yml', '*.conf'])
      expect(intent.recursive).toBe(true)
      expect(intent.maxResults).toBe(25)
    })
  })

  describe('browserIntent', () => {
    it('is always critical risk and clamps unknown actions to open', () => {
      const intent = browserIntent({ url: 'http://x', action: 'exfiltrate' }, call)
      expect(intent.risk).toBe('critical')
      expect(intent.action).toBe('open')
      expect(browserIntent({ url: 'http://x', action: 'screenshot' }, call).action).toBe(
        'screenshot'
      )
    })
  })

  describe('genericIntent', () => {
    it('carries the raw args as payload at low risk', () => {
      const intent = genericIntent('analysis', { foo: 'bar' }, call)
      expect(intent.kind).toBe('analysis')
      expect(intent.payload).toEqual({ foo: 'bar' })
      expect(intent.risk).toBe('low')
    })
  })
})
