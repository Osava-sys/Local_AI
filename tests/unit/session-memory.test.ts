import { describe, expect, it } from 'vitest'
import { MemoryManager } from '../../src/main/agent/memory-manager'
import type { AgentSessionFact } from '../../src/main/storage/repositories/agent-session-memory.repository'

class FakeFactStore {
  facts: AgentSessionFact[] = []

  append(fact: AgentSessionFact): void {
    this.facts.push(fact)
  }

  search(runId: string, query: string, limit: number): AgentSessionFact[] {
    const lower = query.toLowerCase()
    return this.facts
      .filter((fact) => fact.runId === runId)
      .filter(
        (fact) =>
          `${fact.kind} ${fact.key} ${fact.value}`.toLowerCase().includes(lower) ||
          lower.includes(String(fact.port ?? ''))
      )
      .slice(0, limit)
  }

  recent(runId: string, limit: number): AgentSessionFact[] {
    return this.facts.filter((fact) => fact.runId === runId).slice(-limit)
  }
}

describe('MemoryManager persistent session facts', () => {
  it('stores ports, targets, vulnerabilities, users and processes from tool observations', () => {
    const store = new FakeFactStore()
    const memory = new MemoryManager(store)
    memory.startSession('run-1')

    memory.add(
      'tool',
      'Nmap scan report for 192.168.1.5\n22/tcp open ssh OpenSSH\nCVE-2024-12345 user=admin process=sshd.exe'
    )

    expect(store.facts.some((fact) => fact.kind === 'target' && fact.value === '192.168.1.5')).toBe(
      true
    )
    expect(
      store.facts.some(
        (fact) => fact.kind === 'port' && fact.port === 22 && fact.value.includes('open')
      )
    ).toBe(true)
    expect(
      store.facts.some((fact) => fact.kind === 'vulnerability' && fact.value === 'CVE-2024-12345')
    ).toBe(true)
    expect(store.facts.some((fact) => fact.kind === 'user' && fact.value === 'admin')).toBe(true)

    const context = memory.persistentContext('22')
    expect(context).toContain('port=22/tcp')
  })

  it('keeps a rolling history of the last five tool actions', () => {
    const memory = new MemoryManager()

    for (let index = 1; index <= 6; index += 1) {
      memory.recordAction({
        tool: 'network.tool.ts',
        target: `127.0.0.${index}`,
        status: 'success',
        result: `${index}/tcp open`,
      })
    }

    const actions = memory.recentActions()
    expect(actions).toHaveLength(5)
    expect(actions[0].target).toBe('127.0.0.2')
    expect(actions.at(-1)?.target).toBe('127.0.0.6')
    expect(memory.sessionContext('scan')).toContain('Dernières actions')
  })
})
