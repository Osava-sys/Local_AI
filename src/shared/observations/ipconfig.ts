export type NetworkAdapterStatus = 'connected' | 'disconnected' | 'unknown'

export interface NetworkProperty {
  key: string
  label: string
  value: string
}

export interface WindowsNetworkAdapter {
  id: string
  name: string
  status: NetworkAdapterStatus
  properties: NetworkProperty[]
  ipv4Addresses: string[]
  ipv6Addresses: string[]
  defaultGateways: string[]
  dnsServers: string[]
}

export interface WindowsNetworkConfiguration {
  sourceFormat: 'ipconfig' | 'nexus-summary'
  hostName: string | null
  primaryDnsSuffix: string | null
  properties: NetworkProperty[]
  adapters: WindowsNetworkAdapter[]
}

const DOTTED_PROPERTY = /^\s*(.+?)(?:\s*\.\s*){2,}:\s*(.*)$/
const DIRECT_PROPERTY = /^\s*([^:]{2,80}?):\s*(.*)$/
const RAW_ADAPTER_HEADER =
  /^(?:(?:carte|adaptateur)(?:\s+réseau\s+sans\s+fil|\s+ethernet|\s+tunnel|\s+inconnue)?|ethernet adapter|wireless lan adapter|tunnel adapter|unknown adapter)\s+.+:\s*$/i

const PROPERTY_ALIASES: Array<[RegExp, string]> = [
  [/^(nom de lhote|host name|host)$/, 'hostName'],
  [/^(suffixe dns principal|primary dns suffix)$/, 'primaryDnsSuffix'],
  [/^(type de noeud|node type)$/, 'nodeType'],
  [/^(routage ip active|ip routing enabled)$/, 'ipRoutingEnabled'],
  [/^(proxy wins active|wins proxy enabled)$/, 'winsProxyEnabled'],
  [/^(statut du media|media state|status)$/, 'mediaState'],
  [/^description$/, 'description'],
  [/^(adresse physique|physical address|mac)$/, 'physicalAddress'],
  [/^(dhcp active|dhcp enabled|dhcp)$/, 'dhcpEnabled'],
  [/^(configuration automatique activee|autoconfiguration enabled)$/, 'autoconfigurationEnabled'],
  [/^(adresse ipv4|ipv4 address|ipv4)$/, 'ipv4Address'],
  [/^(adresse ipv6|ipv6 address|ipv6)$/, 'ipv6Address'],
  [/^(adresse ipv6 de liaison locale|link-local ipv6 address)$/, 'linkLocalIpv6Address'],
  [/^(masque de sous-reseau|subnet mask)$/, 'subnetMask'],
  [/^(passerelle par defaut|default gateway|gateway)$/, 'defaultGateway'],
  [/^(serveur dhcp|dhcp server)$/, 'dhcpServer'],
  [/^(serveurs dns|dns servers|dns)$/, 'dnsServers'],
  [/^(bail obtenu|lease obtained)$/, 'leaseObtained'],
  [/^(bail expirant|lease expires)$/, 'leaseExpires'],
  [/^(suffixe dns propre a la connexion|connection-specific dns suffix)$/, 'connectionDnsSuffix'],
  [/^(netbios sur tcpip|netbios over tcpip)$/, 'netbiosOverTcpip'],
]

export function isIpconfigOutput(raw: string): boolean {
  if (
    /Configuration IP de Windows|Windows IP Configuration|Windows network configuration summary/i.test(
      raw
    )
  ) {
    return true
  }

  return (
    /(?:Carte|adapter)\s+[^\r\n]+:\s*(?:\r?\n|$)/i.test(raw) &&
    /Adresse IPv4|IPv4 Address|Passerelle par défaut|Default Gateway|DHCP activé|DHCP Enabled/i.test(
      raw
    )
  )
}

/**
 * Parses both native French/English `ipconfig /all` output and NEXUS' compact
 * summary. The parser deliberately keeps unknown properties so renderer and
 * agent features can evolve without losing evidence.
 */
export function parseIpconfigOutput(raw: string): WindowsNetworkConfiguration {
  const sourceFormat = /Windows network configuration summary/i.test(raw)
    ? 'nexus-summary'
    : 'ipconfig'
  const systemProperties: NetworkProperty[] = []
  const adapters: WindowsNetworkAdapter[] = []
  let current: WindowsNetworkAdapter | null = null
  let previousProperty: NetworkProperty | null = null

  for (const rawLine of raw.replace(/\u00a0/g, ' ').split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      previousProperty = null
      continue
    }
    if (
      /^(Configuration IP de Windows|Windows IP Configuration|Windows network configuration summary)/i.test(
        trimmed
      )
    ) {
      continue
    }

    const summaryAdapter = /^Adapter:\s*(.+)$/i.exec(trimmed)
    if (summaryAdapter) {
      current = makeAdapter(summaryAdapter[1], adapters.length)
      adapters.push(current)
      previousProperty = null
      continue
    }

    if (RAW_ADAPTER_HEADER.test(trimmed)) {
      current = makeAdapter(trimmed.replace(/:\s*$/, ''), adapters.length)
      adapters.push(current)
      previousProperty = null
      continue
    }

    const property = parseProperty(rawLine)
    if (property) {
      const target = current?.properties ?? systemProperties
      mergeProperty(target, property)
      previousProperty = target[target.length - 1] ?? null
      continue
    }

    // ipconfig prints additional DNS/gateway addresses on indented continuation lines.
    if (/^\s+/.test(rawLine) && previousProperty && looksLikeAddress(trimmed)) {
      previousProperty.value = [previousProperty.value, trimmed].filter(Boolean).join(', ')
    }
  }

  for (const adapter of adapters) hydrateAdapter(adapter)

  return {
    sourceFormat,
    hostName: firstValue(systemProperties, 'hostName'),
    primaryDnsSuffix: firstValue(systemProperties, 'primaryDnsSuffix'),
    properties: systemProperties,
    adapters,
  }
}

/** Produces a compact, deterministic observation suitable for model memory. */
export function summarizeIpconfig(configuration: WindowsNetworkConfiguration): string {
  const active = configuration.adapters.filter((adapter) => adapter.status === 'connected').length
  const ipv4Count = configuration.adapters.reduce(
    (total, adapter) => total + adapter.ipv4Addresses.length,
    0
  )
  const lines = [
    `Windows network configuration summary: adapters=${configuration.adapters.length} active=${active} ipv4=${ipv4Count}`,
  ]

  if (configuration.hostName) lines.push(`Host: ${configuration.hostName}`)
  if (configuration.primaryDnsSuffix) {
    lines.push(`Primary DNS suffix: ${configuration.primaryDnsSuffix}`)
  }

  const visibleAdapters = configuration.adapters.slice(0, 20)
  for (const adapter of visibleAdapters) {
    lines.push(`Adapter: ${adapter.name}`)
    lines.push(`  Status: ${adapter.status}`)
    appendSummaryProperty(lines, adapter, 'description', 'Description')
    appendSummaryProperty(lines, adapter, 'physicalAddress', 'MAC')
    appendSummaryProperty(lines, adapter, 'dhcpEnabled', 'DHCP')
    appendSummaryValues(lines, 'IPv4', adapter.ipv4Addresses)
    appendSummaryValues(lines, 'IPv6', adapter.ipv6Addresses)
    appendSummaryProperty(lines, adapter, 'subnetMask', 'Subnet mask')
    appendSummaryValues(lines, 'Gateway', adapter.defaultGateways)
    appendSummaryValues(lines, 'DNS', adapter.dnsServers)
  }

  if (configuration.adapters.length > visibleAdapters.length) {
    lines.push(`Adapters omitted: ${configuration.adapters.length - visibleAdapters.length}`)
  }

  return lines.join('\n')
}

export function propertyValue(properties: NetworkProperty[], key: string): string | null {
  return firstValue(properties, key)
}

function makeAdapter(name: string, index: number): WindowsNetworkAdapter {
  const cleanName = name.trim()
  return {
    id: `${slug(cleanName) || 'adapter'}-${index + 1}`,
    name: cleanName,
    status: 'unknown',
    properties: [],
    ipv4Addresses: [],
    ipv6Addresses: [],
    defaultGateways: [],
    dnsServers: [],
  }
}

function parseProperty(line: string): NetworkProperty | null {
  const match = DOTTED_PROPERTY.exec(line) ?? DIRECT_PROPERTY.exec(line)
  if (!match) return null

  const label = match[1].replace(/\s+/g, ' ').trim()
  if (!label) return null
  return {
    key: canonicalPropertyKey(label),
    label,
    value: match[2].trim(),
  }
}

function canonicalPropertyKey(label: string): string {
  const normalized = normalizeLabel(label)
  for (const [pattern, key] of PROPERTY_ALIASES) {
    if (pattern.test(normalized)) return key
  }
  return slug(normalized) || 'property'
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function slug(value: string): string {
  return normalizeLabel(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function mergeProperty(target: NetworkProperty[], property: NetworkProperty): void {
  const existing = target.find(
    (entry) => entry.key === property.key && entry.label === property.label
  )
  if (existing && property.value) {
    existing.value = [existing.value, property.value].filter(Boolean).join(', ')
    return
  }
  target.push(property)
}

function hydrateAdapter(adapter: WindowsNetworkAdapter): void {
  adapter.ipv4Addresses = valuesFor(adapter.properties, 'ipv4Address')
  adapter.ipv6Addresses = [
    ...valuesFor(adapter.properties, 'ipv6Address'),
    ...valuesFor(adapter.properties, 'linkLocalIpv6Address'),
  ]
  adapter.defaultGateways = valuesFor(adapter.properties, 'defaultGateway')
  adapter.dnsServers = valuesFor(adapter.properties, 'dnsServers')

  const state = normalizeLabel(firstValue(adapter.properties, 'mediaState') ?? '')
  if (/disconnected|deconnecte|inactive/.test(state)) adapter.status = 'disconnected'
  else if (/connected|connecte|active/.test(state)) adapter.status = 'connected'
  else if (
    adapter.ipv4Addresses.length > 0 ||
    adapter.ipv6Addresses.length > 0 ||
    adapter.defaultGateways.length > 0
  ) {
    adapter.status = 'connected'
  } else adapter.status = 'unknown'
}

function firstValue(properties: NetworkProperty[], key: string): string | null {
  const value = properties.find((property) => property.key === key)?.value.trim()
  return value || null
}

function valuesFor(properties: NetworkProperty[], key: string): string[] {
  return properties
    .filter((property) => property.key === key)
    .flatMap((property) => property.value.split(/\s*,\s*/))
    .map((value) => value.replace(/\((?:préféré|preferred)\)/gi, '').trim())
    .filter(Boolean)
}

function looksLikeAddress(value: string): boolean {
  return /^(?:[a-f\d:]+(?:%\d+)?|\d{1,3}(?:\.\d{1,3}){3})$/i.test(value)
}

function appendSummaryProperty(
  lines: string[],
  adapter: WindowsNetworkAdapter,
  key: string,
  label: string
): void {
  const value = firstValue(adapter.properties, key)
  if (value) lines.push(`  ${label}: ${value}`)
}

function appendSummaryValues(lines: string[], label: string, values: string[]): void {
  if (values.length > 0) lines.push(`  ${label}: ${values.join(', ')}`)
}
