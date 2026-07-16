import {
  isIpconfigOutput,
  parseIpconfigOutput,
  type WindowsNetworkConfiguration,
} from '@shared/observations/ipconfig'

export interface ProcessObservationRow {
  pid: number
  process: string
}

export interface PortObservationRow {
  target?: string
  port: number
  protocol: 'tcp' | 'udp'
  state: string
  service?: string
  version?: string
  durationMs?: number
}

export interface KeyValueObservationRow {
  label: string
  value: string
}

export type ParsedObservation =
  | { kind: 'network-config'; configuration: WindowsNetworkConfiguration }
  | { kind: 'sockets' }
  | { kind: 'processes'; total: number; rows: ProcessObservationRow[] }
  | { kind: 'ports'; rows: PortObservationRow[] }
  | { kind: 'key-values'; rows: KeyValueObservationRow[] }
  | { kind: 'text' }

const PROCESS_ROW = /^pid=(\d+)\s+process=(.+)$/gim
const NMAP_ROW = /^(\d{1,5})\/(tcp|udp)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/gim
const PROBE_ROW = /^(\S+):(\d{1,5})\/(tcp|udp)\s+(\S+)\s+durationMs=(\d+)$/gim

export function parseObservation(text: string): ParsedObservation {
  if (isIpconfigOutput(text)) {
    return { kind: 'network-config', configuration: parseIpconfigOutput(text) }
  }
  if (/state=LISTENING|Netstat[^:]*summary/i.test(text)) return { kind: 'sockets' }

  const processes = parseProcesses(text)
  if (processes.rows.length > 0) return { kind: 'processes', ...processes }

  const ports = parsePorts(text)
  if (ports.length > 0) return { kind: 'ports', rows: ports }

  const keyValues = parseKeyValues(text)
  if (keyValues.length >= 2) return { kind: 'key-values', rows: keyValues }

  return { kind: 'text' }
}

export function parseProcesses(text: string): { total: number; rows: ProcessObservationRow[] } {
  const rows: ProcessObservationRow[] = []
  const seen = new Set<string>()
  PROCESS_ROW.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PROCESS_ROW.exec(text)) !== null) {
    const key = `${match[1]}|${match[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ pid: Number(match[1]), process: match[2].trim() })
  }

  const summary = /Tasklist summary:\s*(\d+)\s+process/i.exec(text)
  return { total: summary ? Number(summary[1]) : rows.length, rows }
}

export function parsePorts(text: string): PortObservationRow[] {
  const rows: PortObservationRow[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  NMAP_ROW.lastIndex = 0
  while ((match = NMAP_ROW.exec(text)) !== null) {
    const port = Number(match[1])
    if (!validPort(port)) continue
    const key = `${port}|${match[2]}|${match[3]}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      port,
      protocol: match[2].toLowerCase() as 'tcp' | 'udp',
      state: match[3],
      service: normalizeOptional(match[4]),
      version: normalizeOptional(match[5]),
    })
  }

  PROBE_ROW.lastIndex = 0
  while ((match = PROBE_ROW.exec(text)) !== null) {
    const port = Number(match[2])
    if (!validPort(port)) continue
    const key = `${match[1]}|${port}|${match[3]}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      target: match[1],
      port,
      protocol: match[3].toLowerCase() as 'tcp' | 'udp',
      state: match[4],
      durationMs: Number(match[5]),
    })
  }

  return rows
}

export function parseKeyValues(text: string): KeyValueObservationRow[] {
  const rows: KeyValueObservationRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([^:]{2,48}):\s+(.+)\s*$/.exec(line)
    if (!match) continue
    rows.push({ label: match[1].trim(), value: match[2].trim() })
  }
  return rows
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized && normalized !== '-' ? normalized : undefined
}
