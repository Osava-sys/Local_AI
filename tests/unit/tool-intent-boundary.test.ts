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
  })

  describe('networkIntent', () => {
    it('falls back to the version scan for unknown scan types', () => {
      expect(networkIntent({ target: 'localhost', scanType: 'evil' }, call).scanType).toBe('version')
      expect(networkIntent({ target: 'localhost' }, call).scanType).toBe('version')
    })

    it('preserves recognised scan types and filters non-finite ports', () => {
      expect(networkIntent({ target: 'localhost', scanType: 'syn' }, call).scanType).toBe('syn')
      const intent = networkIntent({ target: 'localhost', ports: [80, 'x', 443, NaN] }, call)
      expect(intent.ports).toEqual([80, 443])
      expect(intent.risk).toBe('high')
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
  })

  describe('browserIntent', () => {
    it('is always critical risk and clamps unknown actions to open', () => {
      const intent = browserIntent({ url: 'http://x', action: 'exfiltrate' }, call)
      expect(intent.risk).toBe('critical')
      expect(intent.action).toBe('open')
      expect(browserIntent({ url: 'http://x', action: 'screenshot' }, call).action).toBe('screenshot')
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
