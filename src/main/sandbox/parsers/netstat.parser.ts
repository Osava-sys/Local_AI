import { isIP } from 'net'
import type { NetworkExposure, NetstatPort, TasklistProcess } from '@shared/types/sandbox.types'

const HEADER_OR_SEPARATOR = /^(proto|active connections|connexions actives|\s*$|[-=\s]+$)/i
const MAX_SUMMARY_ROWS = 80
const IMPORTANT_PORTS = new Set([
  22, 53, 80, 135, 137, 138, 139, 443, 445, 1433, 1434, 1900, 2179, 3000, 4000, 5040, 5353, 5355,
  5432, 5433, 7680, 8000, 8033, 8080, 8081, 9080, 9222, 27017,
])

export function parseNetstatOutput(raw: string): NetstatPort[] {
  const ports: NetstatPort[] = []

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || HEADER_OR_SEPARATOR.test(trimmed)) continue

    const parts = trimmed.split(/\s+/)
    const protocol = parts[0]?.toLowerCase()
    if (protocol !== 'tcp' && protocol !== 'udp') continue

    const local = parseEndpoint(parts[1] ?? '')
    if (!local) continue

    const pidText = parts[parts.length - 1]
    const pid = Number(pidText)
    if (!Number.isInteger(pid) || pid < 0) continue

    const state = protocol === 'tcp' ? (parts[3] ?? '').toUpperCase() : 'LISTENING'
    if (protocol === 'tcp' && state !== 'LISTENING') continue

    ports.push({
      protocol,
      localAddress: normalizeAddress(local.address),
      port: local.port,
      state,
      pid,
      exposure: classifyExposure(local.address),
    })
  }

  return dedupePorts(ports)
}

export function summarizeNetstatPorts(ports: NetstatPort[], processes: TasklistProcess[] = []): string {
  const uniquePorts = dedupePorts(ports)
  if (uniquePorts.length === 0) return 'Aucun port LISTENING détecté dans la sortie netstat.'

  const processByPid = new Map(processes.map(process => [process.pid, process.imageName]))
  const exposureCounts = countBy(uniquePorts, port => port.exposure)
  const selectedPorts = selectSummaryPorts(uniquePorts)
  const omittedCount = uniquePorts.length - selectedPorts.length
  const header = [
    `Netstat LISTENING summary: ${uniquePorts.length} unique socket(s).`,
    `Exposure counts: localhost=${exposureCounts.localhost ?? 0}, lan=${exposureCounts.lan ?? 0}, all_interfaces=${exposureCounts.all_interfaces ?? 0}, unknown=${exposureCounts.unknown ?? 0}.`,
    'all_interfaces means the service binds to all local interfaces; confirm firewall/LAN reachability before claiming external accessibility.',
    omittedCount > 0
      ? `Showing ${selectedPorts.length} high-signal socket(s); omitted ${omittedCount} low-signal noisy socket(s).`
      : `Showing all ${selectedPorts.length} socket(s).`,
  ]

  const rows = selectedPorts
    .map(port => formatSummaryRow(port, processByPid.get(port.pid)))
    .join('\n')

  return `${header.join('\n')}\n${rows}`
}

function selectSummaryPorts(ports: NetstatPort[]): NetstatPort[] {
  const highSignal = ports.filter(isHighSignalPort)
  const source = highSignal.length > 0 ? highSignal : ports
  return source
    .slice()
    .sort((a, b) => scorePort(b) - scorePort(a) || a.port - b.port || a.localAddress.localeCompare(b.localAddress))
    .slice(0, MAX_SUMMARY_ROWS)
}

function isHighSignalPort(port: NetstatPort): boolean {
  if (port.protocol === 'tcp') return true
  if (IMPORTANT_PORTS.has(port.port)) return true
  return port.exposure !== 'localhost' && port.port <= 10000
}

function scorePort(port: NetstatPort): number {
  const exposureScore: Record<NetworkExposure, number> = {
    all_interfaces: 400,
    lan: 300,
    localhost: 100,
    unknown: 50,
  }
  const protocolScore = port.protocol === 'tcp' ? 80 : 0
  const importantScore = IMPORTANT_PORTS.has(port.port) ? 120 : 0
  const lowPortScore = port.port < 1024 ? 40 : 0
  return exposureScore[port.exposure] + protocolScore + importantScore + lowPortScore
}

function formatSummaryRow(port: NetstatPort, processName?: string): string {
  const processSuffix = processName ? ` process=${processName}` : ''
  return [
    `${port.protocol.toUpperCase()} ${formatBind(port.localAddress, port.port)}`,
    `state=${port.state}`,
    `pid=${port.pid}`,
    `exposure=${port.exposure}`,
    processSuffix.trim(),
  ]
    .filter(Boolean)
    .join(' ')
}

function parseEndpoint(value: string): { address: string; port: number } | null {
  const bracketed = /^\[([^\]]+)\]:(\d{1,5})$/.exec(value)
  if (bracketed) return parseAddressAndPort(bracketed[1], bracketed[2])

  const separator = value.lastIndexOf(':')
  if (separator <= 0) return null
  return parseAddressAndPort(value.slice(0, separator), value.slice(separator + 1))
}

function parseAddressAndPort(address: string, portText: string): { address: string; port: number } | null {
  const port = Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return { address, port }
}

function normalizeAddress(address: string): string {
  return address.replace(/^\[|\]$/g, '')
}

function classifyExposure(address: string): NetworkExposure {
  const normalized = normalizeAddress(address).toLowerCase()
  if (normalized === '0.0.0.0' || normalized === '::') return 'all_interfaces'
  if (normalized === 'localhost' || normalized === '::1' || normalized.startsWith('127.')) return 'localhost'
  if (isPrivateIpv4(normalized)) return 'lan'
  if (isIP(normalized) !== 0) return 'unknown'
  return 'unknown'
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return false
  const [a, b] = parts
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function formatBind(address: string, port: number): string {
  return address.includes(':') ? `[${address}]:${port}` : `${address}:${port}`
}

function dedupePorts(ports: NetstatPort[]): NetstatPort[] {
  const seen = new Set<string>()
  return ports.filter(port => {
    const key = `${port.protocol}|${port.localAddress}|${port.port}|${port.state}|${port.pid}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function countBy<T extends string>(items: NetstatPort[], key: (item: NetstatPort) => T): Partial<Record<T, number>> {
  const counts: Partial<Record<T, number>> = {}
  for (const item of items) {
    const value = key(item)
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}
