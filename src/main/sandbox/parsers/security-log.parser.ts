export interface ParsedSecurityLog {
  ips: string[]
  urls: string[]
  ports: Array<{ port: number; protocol: 'tcp' | 'udp'; state?: string; service?: string }>
  cves: string[]
  users: string[]
  processes: string[]
  vulnerabilities: string[]
}

const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
const URL_RE = /\bhttps?:\/\/[^\s"'<>]+/gi
const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi
const PORT_RE = /\b(\d{1,5})\/(tcp|udp)\s+(\S+)(?:\s+(\S+))?/gi
const TCP_PROBE_RE = /:(\d{1,5})\/(tcp|udp)\s+(open|closed|timeout)\b/gi
const USER_RE = /\b(?:user(?:name)?|login|account)\s*[:=]\s*([A-Za-z0-9_.@-]{2,64})/gi
const PROCESS_RE = /\bprocess=([A-Za-z0-9_.@-]{2,128})/gi

const VULN_KEYWORDS = [
  'sql injection',
  'xss',
  'cross-site scripting',
  'directory traversal',
  'path traversal',
  'remote code execution',
  'rce',
  'ssrf',
  'lfi',
  'rfi',
  'open redirect',
  'default credentials',
  'weak password',
]

export function parseSecurityLog(raw: string): ParsedSecurityLog {
  return {
    ips: unique(raw.match(IP_RE) ?? []),
    urls: unique(raw.match(URL_RE) ?? []),
    ports: parsePorts(raw),
    cves: unique((raw.match(CVE_RE) ?? []).map(value => value.toUpperCase())),
    users: parseCapture(raw, USER_RE),
    processes: parseCapture(raw, PROCESS_RE),
    vulnerabilities: parseVulnerabilityHints(raw),
  }
}

export function summarizeSecurityLog(parsed: ParsedSecurityLog): string {
  const lines = [
    formatList('IPs', parsed.ips),
    formatList(
      'Ports',
      parsed.ports.map(port => `${port.port}/${port.protocol}${port.state ? ` ${port.state}` : ''}${port.service ? ` ${port.service}` : ''}`),
    ),
    formatList('URLs', parsed.urls),
    formatList('CVEs', parsed.cves),
    formatList('Users', parsed.users),
    formatList('Processes', parsed.processes),
    formatList('Vuln hints', parsed.vulnerabilities),
  ].filter(Boolean)

  return lines.length ? lines.join('\n') : 'No structured security entities extracted.'
}

function parsePorts(raw: string): ParsedSecurityLog['ports'] {
  const ports: ParsedSecurityLog['ports'] = []
  for (const match of raw.matchAll(PORT_RE)) {
    const port = Number(match[1])
    if (!isValidPort(port)) continue
    ports.push({
      port,
      protocol: match[2].toLowerCase() as 'tcp' | 'udp',
      state: match[3]?.toLowerCase(),
      service: match[4],
    })
  }
  for (const match of raw.matchAll(TCP_PROBE_RE)) {
    const port = Number(match[1])
    if (!isValidPort(port)) continue
    ports.push({
      port,
      protocol: match[2].toLowerCase() as 'tcp' | 'udp',
      state: match[3]?.toLowerCase(),
    })
  }
  return uniqueBy(ports, port => `${port.port}/${port.protocol}/${port.state ?? ''}/${port.service ?? ''}`)
}

function parseCapture(raw: string, regex: RegExp): string[] {
  return unique(Array.from(raw.matchAll(regex)).map(match => match[1]))
}

function parseVulnerabilityHints(raw: string): string[] {
  const lower = raw.toLowerCase()
  const hints = VULN_KEYWORDS.filter(keyword => lower.includes(keyword))
  return unique(hints)
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function uniqueBy<T>(values: T[], keyFn: (value: T) => string): T[] {
  const seen = new Set<string>()
  return values.filter(value => {
    const key = keyFn(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function formatList(label: string, values: string[]): string | null {
  return values.length ? `${label}: ${values.join(', ')}` : null
}
