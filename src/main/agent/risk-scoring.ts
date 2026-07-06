import type { NetworkExposure } from '@shared/types/sandbox.types'

export type RiskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ObservedServiceRiskInput {
  target?: string
  port: number
  protocol?: 'tcp' | 'udp'
  state?: string
  service?: string
  version?: string
  exposure?: NetworkExposure | 'internet'
  cves?: string[]
  vulnerabilityHints?: string[]
}

export interface RiskFinding {
  target?: string
  port: number
  protocol: 'tcp' | 'udp'
  service: string
  version: string
  exposure: NetworkExposure | 'internet' | 'unknown'
  cveMatched: string[]
  vulnerabilityHints: string[]
  riskScore: number
  priority: RiskPriority
  recommendation: string
  factors: {
    accessibility: number
    serviceCriticality: number
    versionVulnerability: number
    impact: number
  }
}

const SERVICE_BY_PORT: Record<number, string> = {
  21: 'ftp',
  22: 'ssh',
  23: 'telnet',
  25: 'smtp',
  53: 'dns',
  80: 'http',
  110: 'pop3',
  135: 'rpc',
  139: 'netbios',
  143: 'imap',
  389: 'ldap',
  443: 'https',
  445: 'smb',
  1433: 'mssql',
  1521: 'oracle',
  3000: 'http-dev',
  3306: 'mysql',
  3389: 'rdp',
  4000: 'http-dev',
  5432: 'postgresql',
  5433: 'postgresql',
  5900: 'vnc',
  6379: 'redis',
  8000: 'http-alt',
  8080: 'http-alt',
  8081: 'http-alt',
  9200: 'elasticsearch',
  27017: 'mongodb',
}

const SERVICE_ALIASES: Record<string, string> = {
  domain: 'dns',
  'domain-s': 'dns',
  'http-proxy': 'http-alt',
  'https-alt': 'https',
  mongo: 'mongodb',
  'ms-sql-s': 'mssql',
  'microsoft-ds': 'smb',
  msrpc: 'rpc',
  'netbios-ssn': 'netbios',
  postgres: 'postgresql',
  sunrpc: 'rpc',
  www: 'http',
}

const CRITICAL_SERVICES = new Set([
  'ssh',
  'rdp',
  'smb',
  'microsoft-ds',
  'netbios',
  'rpc',
  'mssql',
  'mysql',
  'postgresql',
  'postgres',
  'mongodb',
  'mongo',
  'redis',
  'oracle',
  'ldap',
  'vnc',
  'telnet',
])

const WEB_OR_ADMIN_SERVICES = new Set([
  'http',
  'https',
  'http-alt',
  'http-dev',
  'ftp',
  'dns',
  'smtp',
  'imap',
  'pop3',
  'elasticsearch',
])

export function scoreObservedServices(inputs: ObservedServiceRiskInput[]): RiskFinding[] {
  const deduped = new Map<string, ObservedServiceRiskInput>()
  for (const input of inputs) {
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) continue
    const key = riskDedupKey(input)
    const previous = deduped.get(key)
    deduped.set(key, mergeRiskInputs(previous, input))
  }

  return [...deduped.values()]
    .map(scoreObservedService)
    .sort((a, b) => b.riskScore - a.riskScore || a.port - b.port)
}

function riskDedupKey(input: ObservedServiceRiskInput): string {
  const service = normalizeService(input.service, input.port)
  return `${input.protocol ?? 'tcp'}:${input.port}:${service}`
}

export function scoreObservedService(input: ObservedServiceRiskInput): RiskFinding {
  const service = normalizeService(input.service, input.port)
  const exposure = resolveExposure(input)
  const cves = unique((input.cves ?? []).map((value) => value.toUpperCase()))
  const hints = unique((input.vulnerabilityHints ?? []).map((value) => value.toLowerCase()))
  const factors = {
    accessibility: accessibilityWeight(exposure),
    serviceCriticality: serviceCriticalityWeight(service),
    versionVulnerability: versionVulnerabilityWeight(input.version, cves, hints),
    impact: impactWeight(service, cves, hints),
  }
  const riskScore = Math.min(
    100,
    Math.round(
      factors.accessibility *
        factors.serviceCriticality *
        factors.versionVulnerability *
        factors.impact *
        10
    ) / 10
  )

  return {
    target: input.target,
    port: input.port,
    protocol: input.protocol ?? 'tcp',
    service,
    version: cleanVersion(input.version),
    exposure,
    cveMatched: cves,
    vulnerabilityHints: hints,
    riskScore,
    priority: priorityFromScore(riskScore),
    recommendation: recommendationFor(service, input.port, exposure, cves),
    factors,
  }
}

export function priorityFromScore(score: number): RiskPriority {
  if (score >= 95) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  return 'LOW'
}

export function highestRiskPriority(findings: RiskFinding[]): RiskPriority {
  return findings[0]?.priority ?? 'LOW'
}

function mergeRiskInputs(
  previous: ObservedServiceRiskInput | undefined,
  next: ObservedServiceRiskInput
): ObservedServiceRiskInput {
  if (!previous) return next
  const exposure = strongerExposure(resolveExposure(previous), resolveExposure(next))
  return {
    ...previous,
    ...next,
    target: preferredTarget(previous, next, exposure),
    protocol: next.protocol ?? previous.protocol,
    state: next.state ?? previous.state,
    service: preferredText(previous.service, next.service),
    version: preferredText(previous.version, next.version),
    exposure,
    cves: unique([...(previous.cves ?? []), ...(next.cves ?? [])]),
    vulnerabilityHints: unique([
      ...(previous.vulnerabilityHints ?? []),
      ...(next.vulnerabilityHints ?? []),
    ]),
  }
}

function preferredText(left?: string, right?: string): string | undefined {
  if (!right) return left
  if (!left) return right
  return right.length > left.length ? right : left
}

function strongerExposure(
  left?: ObservedServiceRiskInput['exposure'],
  right?: ObservedServiceRiskInput['exposure']
): ObservedServiceRiskInput['exposure'] | undefined {
  if (!left) return right
  if (!right) return left
  return accessibilityWeight(right) > accessibilityWeight(left) ? right : left
}

function preferredTarget(
  left: ObservedServiceRiskInput,
  right: ObservedServiceRiskInput,
  exposure: ObservedServiceRiskInput['exposure'] | undefined
): string | undefined {
  const candidates = [left.target, right.target].filter((value): value is string => Boolean(value))
  if (candidates.length === 0) return undefined

  if (exposure === 'all_interfaces') {
    return (
      candidates.find((value) => normalizeTarget(value) === '0.0.0.0') ??
      candidates.find((value) => normalizeTarget(value) === '::') ??
      candidates[0]
    )
  }
  if (exposure === 'lan')
    return candidates.find((value) => isPrivateIp(normalizeTarget(value))) ?? candidates[0]
  if (exposure === 'localhost') {
    return (
      candidates.find((value) => {
        const target = normalizeTarget(value)
        return target === 'localhost' || target === '127.0.0.1' || target === '::1'
      }) ?? candidates[0]
    )
  }
  return right.target ?? left.target
}

function normalizeService(service: string | undefined, port: number): string {
  const normalized = (service ?? '').trim().toLowerCase()
  if (normalized && !normalized.startsWith('durationms=')) {
    return SERVICE_ALIASES[normalized] ?? normalized
  }
  return SERVICE_BY_PORT[port] ?? 'unknown'
}

function cleanVersion(version: string | undefined): string {
  const cleaned = (version ?? '').trim()
  if (!cleaned || cleaned.startsWith('durationMs=')) return 'non déterminée'
  return cleaned
}

function resolveExposure(input: ObservedServiceRiskInput): RiskFinding['exposure'] {
  if (input.exposure) return input.exposure
  const target = normalizeTarget(input.target ?? '')
  if (!target) return 'unknown'
  if (target === 'localhost' || target === '127.0.0.1' || target === '::1') return 'localhost'
  if (target === '0.0.0.0' || target === '::') return 'all_interfaces'
  if (isPrivateIp(target)) return 'lan'
  return 'internet'
}

function accessibilityWeight(exposure: ObservedServiceRiskInput['exposure'] | 'unknown'): number {
  if (exposure === 'internet') return 5
  if (exposure === 'all_interfaces') return 4
  if (exposure === 'lan') return 3
  if (exposure === 'localhost') return 2
  return 2
}

function serviceCriticalityWeight(service: string): number {
  if (CRITICAL_SERVICES.has(service)) return 2
  if (WEB_OR_ADMIN_SERVICES.has(service) || service.includes('http') || service.includes('admin'))
    return 1.5
  return 1
}

function versionVulnerabilityWeight(
  version: string | undefined,
  cves: string[],
  hints: string[]
): number {
  if (cves.length > 0 || hints.some((hint) => hint.includes('cve'))) return 3
  if (version && cleanVersion(version) !== 'non déterminée') return 1.5
  return 1
}

function impactWeight(service: string, cves: string[], hints: string[]): number {
  if (cves.length > 0) return 5
  if (hints.some((hint) => /\b(rce|remote code execution|auth bypass)\b/i.test(hint))) return 5
  if (
    hints.some((hint) => /sql injection|ssrf|default credentials|weak password|lfi|rfi/i.test(hint))
  )
    return 4
  if (
    hints.some((hint) => /xss|traversal|open redirect|information disclosure|info leak/i.test(hint))
  )
    return 2
  if (CRITICAL_SERVICES.has(service)) return 3
  if (service.includes('http')) return 2
  return 1
}

function recommendationFor(
  service: string,
  port: number,
  exposure: RiskFinding['exposure'],
  cves: string[]
): string {
  if (cves.length > 0) {
    return 'Valider la version exacte, appliquer les correctifs éditeur et limiter l’exposition réseau avant tout test plus intrusif.'
  }
  if (service === 'ssh')
    return 'Restreindre SSH aux IP de confiance, imposer les clés et vérifier la version serveur.'
  if (service === 'rdp')
    return 'Limiter RDP au VPN/LAN maîtrisé, activer NLA et vérifier les règles pare-feu.'
  if (service === 'smb' || service === 'microsoft-ds' || port === 445) {
    return 'Limiter SMB aux profils réseau attendus, désactiver les partages inutiles et vérifier signature/versions.'
  }
  if (service === 'postgresql' || port === 5432 || port === 5433) {
    return 'Vérifier listen_addresses, pg_hba.conf, authentification et exposition pare-feu PostgreSQL.'
  }
  if (service === 'mongodb' || port === 27017) {
    return 'Vérifier bindIp, authentification MongoDB, comptes par défaut et exposition du port 27017.'
  }
  if (service === 'redis' || port === 6379) {
    return 'Vérifier bind, ACL/authentification Redis et bloquer l’accès réseau non nécessaire.'
  }
  if (service.includes('http') || port === 80 || port === 443 || port === 8080) {
    return 'Identifier l’application, relever headers/version, protéger les endpoints d’administration et tester seulement les chemins non destructifs.'
  }
  if (exposure === 'all_interfaces' || exposure === 'lan' || exposure === 'internet') {
    return 'Confirmer que ce service doit être joignable sur ce réseau, sinon restreindre le bind ou le pare-feu.'
  }
  return 'Conserver comme surface à vérifier: collecter version, configuration et besoin métier avant de conclure.'
}

function isPrivateIp(value: string): boolean {
  if (/^10\./.test(value)) return true
  if (/^192\.168\./.test(value)) return true
  const match = /^172\.(\d{1,2})\./.exec(value)
  if (!match) return false
  const second = Number(match[1])
  return second >= 16 && second <= 31
}

function normalizeTarget(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}
