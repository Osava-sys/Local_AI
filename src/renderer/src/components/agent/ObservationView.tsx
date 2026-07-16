import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  CircleOff,
  Clock3,
  Copy,
  Cpu,
  FlaskConical,
  Gauge,
  Network,
  Server,
  Terminal,
} from 'lucide-react'
import type { AgentRunStep } from '@shared/types/agent.types'
import type {
  NetworkAdapterStatus,
  NetworkProperty,
  WindowsNetworkAdapter,
  WindowsNetworkConfiguration,
} from '@shared/observations/ipconfig'
import { propertyValue } from '@shared/observations/ipconfig'
import { parseObservation, type ParsedObservation } from '../../lib/observation'
import { ExpandableText, SocketsView } from '../reports/StructuredReport'
import { Badge, type BadgeTone } from '../ui/Badge'

const FIELD_LABELS: Record<string, string> = {
  description: 'Description',
  mediaState: 'État du média',
  physicalAddress: 'Adresse MAC',
  dhcpEnabled: 'DHCP',
  autoconfigurationEnabled: 'Configuration auto',
  ipv4Address: 'Adresse IPv4',
  ipv6Address: 'Adresse IPv6',
  linkLocalIpv6Address: 'IPv6 locale',
  subnetMask: 'Masque de sous-réseau',
  defaultGateway: 'Passerelle',
  dhcpServer: 'Serveur DHCP',
  dnsServers: 'Serveurs DNS',
  connectionDnsSuffix: 'Suffixe DNS',
  leaseObtained: 'Bail obtenu',
  leaseExpires: 'Bail expirant',
  netbiosOverTcpip: 'NetBIOS/TCP',
}

const FIELD_ORDER = [
  'description',
  'ipv4Address',
  'subnetMask',
  'defaultGateway',
  'dnsServers',
  'physicalAddress',
  'dhcpEnabled',
  'dhcpServer',
  'ipv6Address',
  'linkLocalIpv6Address',
  'connectionDnsSuffix',
  'leaseObtained',
  'leaseExpires',
  'autoconfigurationEnabled',
  'netbiosOverTcpip',
  'mediaState',
]

export function ObservationView({ step }: { step: AgentRunStep }): React.ReactElement {
  const text = step.observation ?? step.content
  const parsed = useMemo(() => parseObservation(text), [text])
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const status = observationStatus(step)

  function copyRaw(): void {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <article className="observation-result" data-tone={status.tone}>
      <header className="observation-result__header">
        <span className="observation-result__icon" aria-hidden="true">
          {observationIcon(parsed)}
        </span>
        <div className="observation-result__identity">
          <div className="observation-result__title-line">
            <strong>{observationTitle(parsed)}</strong>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <span>{step.toolCall?.name ? `Source · ${step.toolCall.name}` : 'Source · agent'}</span>
        </div>
        <div className="observation-result__meta" aria-label="Métadonnées de l’observation">
          <span title="Heure de collecte">
            <Clock3 size={12} /> {formatClock(step.timestamp)}
          </span>
          {step.metadata?.durationMs !== undefined && (
            <span title="Durée">
              <Gauge size={12} /> {formatDuration(step.metadata.durationMs)}
            </span>
          )}
          {step.metadata?.confidenceScore !== undefined && (
            <span title="Confiance de collecte">
              {Math.round(step.metadata.confidenceScore * 100)} %
            </span>
          )}
        </div>
      </header>

      <div className="observation-result__body">
        <ObservationBody parsed={parsed} showAll={showAll} text={text} />
      </div>

      {parsed.kind !== 'text' && (
        <footer className="observation-result__footer">
          {rowCount(parsed) > rowLimit(parsed) && (
            <button
              className="link-button"
              type="button"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Réduire les résultats' : `Afficher les ${rowCount(parsed)} résultats`}
            </button>
          )}
          <details className="observation-raw">
            <summary>
              <Terminal size={13} /> Sortie brute
              <ChevronDown className="chev" size={13} />
            </summary>
            <div className="observation-raw__toolbar">
              <span>{text.length.toLocaleString('fr-FR')} caractères</span>
              <button type="button" onClick={copyRaw}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
            <pre>{text}</pre>
          </details>
        </footer>
      )}
    </article>
  )
}

function ObservationBody({
  parsed,
  showAll,
  text,
}: {
  parsed: ParsedObservation
  showAll: boolean
  text: string
}): React.ReactElement {
  switch (parsed.kind) {
    case 'network-config':
      return <NetworkConfigurationView configuration={parsed.configuration} showAll={showAll} />
    case 'sockets':
      return <SocketsView limit={showAll ? Number.MAX_SAFE_INTEGER : 20} text={text} />
    case 'processes': {
      const rows = showAll ? parsed.rows : parsed.rows.slice(0, 30)
      return (
        <div className="observation-structured">
          <div className="stat-row">
            <Stat label="Processus détectés" value={parsed.total} />
            <Stat label="Affichés" value={rows.length} />
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Processus</th>
                  <th className="num">PID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.pid}-${row.process}`}>
                    <td className="strong">{row.process}</td>
                    <td className="num mono">{row.pid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }
    case 'ports': {
      const rows = showAll ? parsed.rows : parsed.rows.slice(0, 40)
      const open = parsed.rows.filter((row) => /open|ouvert/i.test(row.state)).length
      return (
        <div className="observation-structured">
          <div className="stat-row">
            <Stat label="Ports observés" value={parsed.rows.length} />
            <Stat label="Ouverts" tone={open > 0 ? 'warning' : 'success'} value={open} />
            <Stat
              label="Cibles"
              value={new Set(parsed.rows.map((row) => row.target).filter(Boolean)).size || 1}
            />
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Protocole</th>
                  <th>État</th>
                  <th>Service / cible</th>
                  <th>Version / durée</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.target ?? 'local'}-${row.port}-${row.protocol}-${index}`}>
                    <td className="mono strong">{row.port}</td>
                    <td className="mono muted">{row.protocol.toUpperCase()}</td>
                    <td>
                      <Badge tone={/open|ouvert/i.test(row.state) ? 'warning' : 'neutral'}>
                        {row.state}
                      </Badge>
                    </td>
                    <td>{row.service ?? row.target ?? '—'}</td>
                    <td className="muted">
                      {row.version ?? (row.durationMs !== undefined ? `${row.durationMs} ms` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }
    case 'key-values':
      return (
        <dl className="observation-kv-grid">
          {parsed.rows.map((row, index) => (
            <div key={`${row.label}-${index}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )
    case 'text':
    default:
      return <ExpandableText clamp={6} text={text} />
  }
}

function NetworkConfigurationView({
  configuration,
  showAll,
}: {
  configuration: WindowsNetworkConfiguration
  showAll: boolean
}): React.ReactElement {
  const activeAdapters = configuration.adapters.filter((adapter) => adapter.status === 'connected')
  const ipv4Count = configuration.adapters.reduce(
    (total, adapter) => total + adapter.ipv4Addresses.length,
    0
  )
  const gatewayCount = new Set(configuration.adapters.flatMap((adapter) => adapter.defaultGateways))
    .size
  const adapters = [...configuration.adapters].sort(
    (a, b) => statusOrder(a.status) - statusOrder(b.status) || a.name.localeCompare(b.name)
  )
  const visible = showAll ? adapters : adapters.slice(0, 6)

  return (
    <div className="observation-structured">
      <div className="stat-row observation-network-summary">
        <Stat label="Interfaces" value={configuration.adapters.length} />
        <Stat
          label="Actives"
          tone={activeAdapters.length > 0 ? 'success' : 'warning'}
          value={activeAdapters.length}
        />
        <Stat label="Adresses IPv4" value={ipv4Count} />
        <Stat label="Passerelles" value={gatewayCount} />
      </div>

      {(configuration.hostName || configuration.primaryDnsSuffix) && (
        <dl className="observation-kv-grid observation-kv-grid--system">
          {configuration.hostName && (
            <div>
              <dt>Nom de l’hôte</dt>
              <dd>{configuration.hostName}</dd>
            </div>
          )}
          {configuration.primaryDnsSuffix && (
            <div>
              <dt>Suffixe DNS principal</dt>
              <dd>{configuration.primaryDnsSuffix}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="network-adapter-list">
        {visible.map((adapter) => (
          <NetworkAdapterCard adapter={adapter} key={adapter.id} />
        ))}
      </div>
    </div>
  )
}

function NetworkAdapterCard({ adapter }: { adapter: WindowsNetworkAdapter }): React.ReactElement {
  const properties = sortProperties(adapter.properties).filter(
    (property) => property.value && property.key !== 'mediaState'
  )
  const primary = properties.slice(0, 8)
  const additional = properties.slice(8)
  const statusLabel =
    adapter.status === 'connected'
      ? 'Connectée'
      : adapter.status === 'disconnected'
        ? 'Déconnectée'
        : 'État inconnu'

  return (
    <article className="network-adapter" data-status={adapter.status}>
      <header>
        <span className="network-adapter__icon">
          {adapter.status === 'disconnected' ? <CircleOff size={16} /> : <Network size={16} />}
        </span>
        <div>
          <strong>{adapter.name}</strong>
          <span>
            {propertyValue(adapter.properties, 'description') ?? 'Interface réseau Windows'}
          </span>
        </div>
        <Badge tone={adapterStatusTone(adapter.status)}>{statusLabel}</Badge>
      </header>
      <dl className="network-adapter__fields">
        {primary.map((property) => (
          <PropertyRow
            key={`${adapter.id}-${property.key}-${property.value}`}
            property={property}
          />
        ))}
      </dl>
      {additional.length > 0 && (
        <details className="network-adapter__details">
          <summary>
            {additional.length} propriété{additional.length > 1 ? 's' : ''} supplémentaire
            {additional.length > 1 ? 's' : ''}
            <ChevronDown size={13} />
          </summary>
          <dl className="network-adapter__fields">
            {additional.map((property) => (
              <PropertyRow
                key={`${adapter.id}-${property.key}-${property.value}`}
                property={property}
              />
            ))}
          </dl>
        </details>
      )}
    </article>
  )
}

function PropertyRow({ property }: { property: NetworkProperty }): React.ReactElement {
  return (
    <div>
      <dt>{FIELD_LABELS[property.key] ?? property.label}</dt>
      <dd className={isTechnicalValue(property.value) ? 'mono' : undefined}>
        {property.value || '—'}
      </dd>
    </div>
  )
}

function Stat({
  label,
  tone = 'neutral',
  value,
}: {
  label: string
  tone?: BadgeTone
  value: React.ReactNode
}): React.ReactElement {
  return (
    <div className="stat-tile" data-tone={tone}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function observationStatus(step: AgentRunStep): { label: string; tone: BadgeTone } {
  switch (step.toolCall?.status) {
    case 'error':
    case 'rejected':
      return { label: 'Échec', tone: 'danger' }
    case 'requires_approval':
      return { label: 'En attente', tone: 'warning' }
    case 'running':
      return { label: 'En cours', tone: 'accent' }
    default:
      return { label: 'Collectée', tone: 'success' }
  }
}

function observationTitle(parsed: ParsedObservation): string {
  switch (parsed.kind) {
    case 'network-config':
      return 'Configuration réseau Windows'
    case 'sockets':
      return 'Sockets en écoute'
    case 'processes':
      return 'Processus locaux'
    case 'ports':
      return 'Résultats réseau'
    case 'key-values':
      return 'Données système'
    default:
      return 'Observation'
  }
}

function observationIcon(parsed: ParsedObservation): React.ReactElement {
  switch (parsed.kind) {
    case 'network-config':
    case 'sockets':
    case 'ports':
      return <Network size={17} />
    case 'processes':
      return <Cpu size={17} />
    case 'key-values':
      return <Server size={17} />
    default:
      return <FlaskConical size={17} />
  }
}

function rowCount(parsed: ParsedObservation): number {
  switch (parsed.kind) {
    case 'network-config':
      return parsed.configuration.adapters.length
    case 'processes':
      return parsed.rows.length
    case 'ports':
      return parsed.rows.length
    default:
      return 0
  }
}

function rowLimit(parsed: ParsedObservation): number {
  if (parsed.kind === 'network-config') return 6
  if (parsed.kind === 'processes') return 30
  if (parsed.kind === 'ports') return 40
  return Number.MAX_SAFE_INTEGER
}

function sortProperties(properties: NetworkProperty[]): NetworkProperty[] {
  return properties
    .filter((property, index, values) => {
      return (
        values.findIndex(
          (candidate) => candidate.key === property.key && candidate.value === property.value
        ) === index
      )
    })
    .sort((a, b) => {
      const aIndex = FIELD_ORDER.indexOf(a.key)
      const bIndex = FIELD_ORDER.indexOf(b.key)
      return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex)
    })
}

function statusOrder(status: NetworkAdapterStatus): number {
  if (status === 'connected') return 0
  if (status === 'unknown') return 1
  return 2
}

function adapterStatusTone(status: NetworkAdapterStatus): BadgeTone {
  if (status === 'connected') return 'success'
  if (status === 'disconnected') return 'neutral'
  return 'warning'
}

function isTechnicalValue(value: string): boolean {
  return /(?:\b\d{1,3}(?:\.\d{1,3}){3}\b|[a-f\d]{2}(?:[:-][a-f\d]{2}){5}|[a-f\d:]{4,})/i.test(value)
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)} s`
}
