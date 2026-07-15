import type { AgentRunStep } from '@shared/types/agent.types'

export type RiskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ReportFinding {
  port?: number
  protocol?: string
  service?: string
  version?: string
  exposure?: string
  cveMatched?: string[]
  riskScore?: number
  priority?: RiskPriority
}

export interface ReportRecommendation {
  priority?: RiskPriority
  category?: string
  finding?: string
  remediation?: string
}

export interface ReportSummary {
  totalPortsScanned?: number
  openPorts?: number
  servicesDetected?: string[]
  cveMatched?: string[]
  riskLevel?: RiskPriority
}

export interface ReportPhase {
  name?: string
  steps?: string[]
  findings?: ReportFinding[]
}

export interface AgentReport {
  runId?: string
  target?: string
  durationMs?: number | null
  summary: ReportSummary
  findings: ReportFinding[]
  recommendations: ReportRecommendation[]
  phases: ReportPhase[]
}

export interface SocketRow {
  protocol: 'TCP' | 'UDP'
  address: string
  port: number
  state: string
  pid: number
  exposure: string
}

export interface NetstatSummary {
  total: number
  localhost?: number
  lan?: number
  allInterfaces?: number
  unknown?: number
}

/** Returns the balanced `{...}` object starting at `start`, honouring strings. */
function sliceBalanced(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Extracts the embedded report JSON object from a FINAL/report text blob. */
function extractReportObject(text: string): Record<string, unknown> | null {
  const marker = text.search(/rapport json|report json/i)
  const searchFrom = marker >= 0 ? marker : 0
  let cursor = text.indexOf('{', searchFrom)
  while (cursor >= 0) {
    const slice = sliceBalanced(text, cursor)
    if (slice) {
      try {
        const parsed = JSON.parse(slice) as Record<string, unknown>
        if (parsed && typeof parsed === 'object' && ('phases' in parsed || 'summary' in parsed || 'recommendations' in parsed)) {
          return parsed
        }
      } catch {
        // Not valid JSON here — keep scanning for the next brace.
      }
    }
    cursor = text.indexOf('{', cursor + 1)
  }
  return null
}

function asFindings(value: unknown): ReportFinding[] {
  return Array.isArray(value) ? (value as ReportFinding[]) : []
}

function normalizeReport(raw: Record<string, unknown>): AgentReport {
  const phases = Array.isArray(raw.phases) ? (raw.phases as ReportPhase[]) : []
  const flatFindings = phases.flatMap(phase => asFindings(phase.findings))
  const directFindings = asFindings(raw.findings)
  const findings = [...directFindings, ...flatFindings].sort(
    (a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0),
  )
  return {
    runId: typeof raw.runId === 'string' ? raw.runId : undefined,
    target: typeof raw.target === 'string' ? raw.target : undefined,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : null,
    summary: (raw.summary as ReportSummary) ?? {},
    findings,
    recommendations: Array.isArray(raw.recommendations) ? (raw.recommendations as ReportRecommendation[]) : [],
    phases,
  }
}

/** Parses a structured report from a single text blob, if it embeds one. */
export function parseReportText(text: string): AgentReport | null {
  if (!text.includes('{')) return null
  const object = extractReportObject(text)
  return object ? normalizeReport(object) : null
}

/** Finds and parses the most recent structured report across the agent steps. */
export function extractReport(steps: AgentRunStep[]): AgentReport | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const content = steps[i]?.content ?? ''
    if (!content.includes('{')) continue
    const object = extractReportObject(content)
    if (object) return normalizeReport(object)
  }
  return null
}

const SOCKET_RE =
  /(TCP|UDP)\s+(\S+?):(\d+)\s+state=(\S+)\s+pid=(\d+)\s+exposure=(\S+)/gi

/** Parses `TCP <addr>:<port> state=… pid=… exposure=…` lines into typed rows. */
export function parseSockets(text: string): SocketRow[] {
  const rows: SocketRow[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  SOCKET_RE.lastIndex = 0
  while ((match = SOCKET_RE.exec(text)) !== null) {
    const key = `${match[1]}|${match[2]}|${match[3]}|${match[5]}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      protocol: match[1].toUpperCase() as 'TCP' | 'UDP',
      address: match[2],
      port: Number(match[3]),
      state: match[4],
      pid: Number(match[5]),
      exposure: match[6],
    })
  }
  return rows
}

/** Extracts the "Netstat LISTENING summary" counts, when present. */
export function parseNetstatSummary(text: string): NetstatSummary | null {
  const total = text.match(/Netstat[^:]*summary:\s*(\d+)\s+unique/i)
  if (!total) return null
  const num = (key: string): number | undefined => {
    const found = text.match(new RegExp(`${key}=(\\d+)`, 'i'))
    return found ? Number(found[1]) : undefined
  }
  return {
    total: Number(total[1]),
    localhost: num('localhost'),
    lan: num('lan'),
    allInterfaces: num('all_interfaces'),
    unknown: num('unknown'),
  }
}

export function isReportText(text: string): boolean {
  return /rapport json|report json|"recommendations"|"phases"/i.test(text)
}

export function isNetstatText(text: string): boolean {
  return /state=LISTENING|Netstat[^:]*summary/i.test(text)
}

export function riskTone(value?: string | number): 'success' | 'warning' | 'danger' | 'critical' | 'neutral' {
  if (typeof value === 'number') {
    if (value >= 85) return 'critical'
    if (value >= 65) return 'danger'
    if (value >= 40) return 'warning'
    return 'success'
  }
  const level = (value ?? '').toUpperCase()
  if (level === 'CRITICAL') return 'critical'
  if (level === 'HIGH') return 'danger'
  if (level === 'MEDIUM') return 'warning'
  if (level === 'LOW') return 'success'
  return 'neutral'
}

export function exposureTone(exposure: string): 'danger' | 'warning' | 'accent' | 'neutral' {
  const value = exposure.toLowerCase()
  if (value.includes('all_interfaces')) return 'warning'
  if (value.includes('lan')) return 'accent'
  if (value.includes('localhost')) return 'neutral'
  return 'neutral'
}
