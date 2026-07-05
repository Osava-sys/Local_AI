import type {
  AgentSessionFact,
  AgentSessionMemoryRepository,
} from '../storage/repositories/agent-session-memory.repository'
import { parseSecurityLog } from '../sandbox/parsers/security-log.parser'

export interface MemoryMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  createdAt: string
}

export interface AgentActionMemory {
  tool: string
  target?: string
  status?: string
  result: string
  createdAt: string
}

export class MemoryManager {
  private readonly messages: MemoryMessage[] = []
  private readonly actions: AgentActionMemory[] = []
  private sessionId: string | null = null
  private readonly factKeys = new Set<string>()

  constructor(
    private readonly factStore?: Pick<AgentSessionMemoryRepository, 'append' | 'search' | 'recent'>
  ) {}

  startSession(sessionId: string): void {
    this.sessionId = sessionId
    this.factKeys.clear()
    this.actions.length = 0
  }

  add(role: MemoryMessage['role'], content: string): void {
    this.messages.push({
      role,
      content,
      createdAt: new Date().toISOString(),
    })

    if (role === 'tool') this.rememberFacts(content)
  }

  snapshot(maxMessages = 20): MemoryMessage[] {
    return this.messages.slice(-maxMessages)
  }

  transcript(maxMessages = 20): string {
    return this.snapshot(maxMessages)
      .map((message) => `[${message.role.toUpperCase()}] ${message.content}`)
      .join('\n\n')
  }

  recordAction(action: Omit<AgentActionMemory, 'createdAt'>): void {
    this.actions.push({
      ...action,
      result: summarizeActionResult(action.result),
      createdAt: new Date().toISOString(),
    })
    if (this.actions.length > 5) this.actions.splice(0, this.actions.length - 5)
  }

  recentActions(maxActions = 5): AgentActionMemory[] {
    return this.actions.slice(-maxActions)
  }

  persistentContext(query: string, maxFacts = 12): string {
    if (!this.sessionId || !this.factStore) return ''

    const facts = this.factStore.search(this.sessionId, query, maxFacts)
    const fallback = facts.length ? facts : this.factStore.recent(this.sessionId, maxFacts)
    if (fallback.length === 0) return ''

    return fallback.map(formatFact).join('\n')
  }

  sessionContext(query: string, maxFacts = 12): string {
    const sections: string[] = []
    const actions = this.recentActions()
    if (actions.length > 0) {
      sections.push(['Dernières actions:', ...actions.map(formatAction)].join('\n'))
    }

    const facts = this.persistentContext(query, maxFacts)
    if (facts) sections.push(`Faits persistants:\n${facts}`)
    return sections.join('\n\n')
  }

  currentSessionId(): string | null {
    return this.sessionId
  }

  clear(): void {
    this.messages.length = 0
    this.actions.length = 0
  }

  private rememberFacts(content: string): void {
    if (!this.sessionId || !this.factStore) return

    for (const fact of factsFromObservation(this.sessionId, content)) {
      const key = `${fact.kind}:${fact.key}:${fact.value}:${fact.target ?? ''}:${fact.port ?? ''}:${fact.protocol ?? ''}`
      if (this.factKeys.has(key)) continue
      this.factKeys.add(key)
      this.factStore.append(fact)
    }
  }
}

function factsFromObservation(runId: string, content: string): AgentSessionFact[] {
  const parsed = parseSecurityLog(content)
  const facts: AgentSessionFact[] = []

  for (const ip of parsed.ips)
    facts.push({ runId, kind: 'target', key: ip, value: ip, target: ip, source: 'observation' })
  for (const url of parsed.urls)
    facts.push({ runId, kind: 'url', key: url, value: url, source: 'observation' })
  for (const port of parsed.ports) {
    facts.push({
      runId,
      kind: 'port',
      key: `${port.port}/${port.protocol}`,
      value: `${port.state ?? 'unknown'}${port.service ? ` ${port.service}` : ''}`,
      port: port.port,
      protocol: port.protocol,
      source: 'observation',
    })
  }
  for (const user of parsed.users)
    facts.push({ runId, kind: 'user', key: user, value: user, source: 'observation' })
  for (const process of parsed.processes) {
    facts.push({ runId, kind: 'process', key: process, value: process, source: 'observation' })
  }
  for (const cve of parsed.cves) {
    facts.push({ runId, kind: 'vulnerability', key: cve, value: cve, source: 'observation' })
  }
  for (const hint of parsed.vulnerabilities) {
    facts.push({ runId, kind: 'vulnerability', key: hint, value: hint, source: 'observation' })
  }

  return facts
}

function formatFact(fact: AgentSessionFact): string {
  const target = fact.target ? ` target=${fact.target}` : ''
  const port = fact.port ? ` port=${fact.port}${fact.protocol ? `/${fact.protocol}` : ''}` : ''
  return `- ${fact.kind}: ${fact.key} => ${fact.value}${target}${port}`
}

function formatAction(action: AgentActionMemory): string {
  const target = action.target ? ` target=${action.target}` : ''
  const status = action.status ? ` status=${action.status}` : ''
  return `- ${action.tool}${target}${status}: ${action.result}`
}

function summarizeActionResult(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 240) return normalized
  return `${normalized.slice(0, 237)}...`
}
