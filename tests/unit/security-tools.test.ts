import { describe, expect, it } from 'vitest'
import type { ToolCall } from '@shared/types/agent.types'
import { ApprovalPolicy } from '../../src/main/approvals/approval-policy'
import { burpSuiteCliTool } from '../../src/main/agent/tools/burpsuite-cli.tool'
import { gobusterTool } from '../../src/main/agent/tools/gobuster.tool'
import { nmapTool } from '../../src/main/agent/tools/nmap.tool'
import { sqlmapTool } from '../../src/main/agent/tools/sqlmap.tool'
import { ToolRegistry } from '../../src/main/agent/tools/registry'

const call: ToolCall = { id: 'call-1', name: 'x', args: {}, status: 'pending' }

describe('structured security tools', () => {
  it('builds a bounded nmap shell intent with target metadata', () => {
    const intent = nmapTool.createIntent(
      { target: '127.0.0.1', ports: [80, 443], scanType: 'version', interfaceName: 'eth0' },
      call,
    )

    expect(intent.kind).toBe('shell')
    if (intent.kind !== 'shell') throw new Error('expected shell intent')
    expect(intent.command).toBe('nmap')
    expect(intent.args).toContain('-sV')
    expect(intent.args).toContain('80,443')
    expect(intent.networkTarget).toBe('127.0.0.1')
    expect(intent.maxConnections).toBe(2)
    expect(intent.bindInterface).toBe('eth0')
  })

  it('rejects invalid gobuster arguments before execution', () => {
    const intent = gobusterTool.createIntent({ url: 'http://127.0.0.1' }, call)

    expect(intent.kind).toBe('analysis')
    if (intent.kind !== 'analysis') throw new Error('expected validation analysis intent')
    expect(intent.payload.operation).toBe('tool_validation_error')
  })

  it('marks sqlmap and burp intents as critical risk', () => {
    const sqlmap = sqlmapTool.createIntent({ url: 'http://127.0.0.1/item?id=1' }, call)
    const burp = burpSuiteCliTool.createIntent({ target: 'http://127.0.0.1' }, call)

    expect(sqlmap.risk).toBe('critical')
    expect(burp.risk).toBe('critical')
  })

  it('requires approval for external structured shell targets', () => {
    const policy = new ApprovalPolicy({
      defaultDecision: 'allow',
      criticalPatterns: [],
      deniedPatterns: [],
      localTargets: [],
      highRiskTools: [],
    })
    const intent = nmapTool.createIntent({ target: 'example.com', ports: [80] }, call)

    expect(policy.evaluate(intent).decision).toBe('needs_human_approval')
  })

  it('registers security tool aliases in the registry', () => {
    const registry = new ToolRegistry()
    expect(registry.has('nmap')).toBe(true)
    expect(registry.has('gobuster.tool.ts')).toBe(true)
    expect(registry.has('sqlmap.tool')).toBe(true)
    // parser.tool is intentionally NOT exposed to the model: the sandbox already
    // structures tool output, so the agent must not re-parse fabricated text.
    expect(registry.has('parser')).toBe(false)
    expect(registry.has('parser.tool.ts')).toBe(false)
  })
})
