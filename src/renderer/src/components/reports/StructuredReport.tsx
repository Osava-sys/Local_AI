import { useState } from 'react'
import { ChevronDown, FileText, ListChecks, Network, ShieldAlert } from 'lucide-react'
import type { AgentReport, ReportFinding, ReportRecommendation, SocketRow } from '../../lib/report'
import { exposureTone, parseNetstatSummary, parseReportText, parseSockets, riskTone } from '../../lib/report'
import { Badge, type BadgeTone } from '../ui/Badge'

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

/** Collapsible block of raw text, clamped until expanded. */
export function ExpandableText({ text, clamp = 4 }: { text: string; clamp?: number }): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <p className={open ? 'expandable is-open' : 'expandable'} style={open ? undefined : { WebkitLineClamp: clamp }}>
        {text}
      </p>
      <button className="link-button" type="button" onClick={() => setOpen(value => !value)}>
        {open ? 'Réduire' : 'Afficher tout'}
      </button>
    </div>
  )
}

function StatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: BadgeTone }): React.ReactElement {
  return (
    <div className="stat-tile" data-tone={tone ?? 'neutral'}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function FindingsTable({ findings }: { findings: ReportFinding[] }): React.ReactElement {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Port</th>
            <th>Proto</th>
            <th>Service</th>
            <th>Exposition</th>
            <th>Version</th>
            <th className="num">Risque</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding, index) => (
            <tr key={`${finding.port}-${finding.protocol}-${index}`}>
              <td className="mono strong">{finding.port ?? '—'}</td>
              <td className="mono muted">{(finding.protocol ?? '—').toUpperCase()}</td>
              <td>{finding.service ?? '—'}</td>
              <td>
                {finding.exposure ? (
                  <Badge tone={exposureTone(finding.exposure)}>{finding.exposure}</Badge>
                ) : (
                  '—'
                )}
              </td>
              <td className="muted">{finding.version && finding.version !== 'non déterminée' ? finding.version : '—'}</td>
              <td className="num">
                <div className="score-cell">
                  <span className="risk-chip" data-risk={(finding.priority ?? 'low').toLowerCase()}>
                    {finding.priority ?? 'LOW'}
                  </span>
                  <span className="mono">{finding.riskScore ?? 0}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Recommendations({ items }: { items: ReportRecommendation[] }): React.ReactElement {
  const sorted = [...items].sort(
    (a, b) => (PRIORITY_ORDER[a.priority ?? 'LOW'] ?? 9) - (PRIORITY_ORDER[b.priority ?? 'LOW'] ?? 9),
  )
  return (
    <div className="reco-list">
      {sorted.map((item, index) => (
        <div className="reco-card" key={index} data-tone={riskTone(item.priority)}>
          <div className="reco-card__head">
            <span className="risk-chip" data-risk={(item.priority ?? 'low').toLowerCase()}>
              {item.priority ?? 'LOW'}
            </span>
            {item.category && <span className="reco-cat">{item.category}</span>}
          </div>
          {item.finding && <div className="reco-finding mono">{item.finding}</div>}
          {item.remediation && <p className="reco-fix">{item.remediation}</p>}
        </div>
      ))}
    </div>
  )
}

/** Professional render of a parsed reconnaissance report. */
export function StructuredReport({ report }: { report: AgentReport }): React.ReactElement {
  const { summary } = report
  const services = summary.servicesDetected ?? []
  const cveCount = summary.cveMatched?.length ?? 0
  return (
    <div className="report">
      <div className="report-head">
        <div className="report-head__title">
          <span className="section-label">Rapport de reconnaissance</span>
          <h3>
            {report.target && report.target !== '::' ? report.target : 'Périmètre local'}
            {report.runId && <span className="mono muted"> · {report.runId.slice(0, 13)}</span>}
          </h3>
        </div>
        {summary.riskLevel && (
          <Badge tone={riskTone(summary.riskLevel)}>Risque {summary.riskLevel}</Badge>
        )}
      </div>

      <div className="stat-row">
        <StatTile label="Ports scannés" value={summary.totalPortsScanned ?? '—'} />
        <StatTile label="Ports ouverts" value={summary.openPorts ?? report.findings.length} />
        <StatTile label="Services" value={services.length} />
        <StatTile label="CVE" value={cveCount} tone={cveCount > 0 ? 'danger' : 'success'} />
        <StatTile label="Findings" value={report.findings.length} />
      </div>

      {services.length > 0 && (
        <div className="chip-row">
          {services.map(service => (
            <span className="soft-chip" key={service}>
              {service}
            </span>
          ))}
        </div>
      )}

      {report.findings.length > 0 && (
        <section className="report-section">
          <span className="section-label">
            <ShieldAlert size={13} /> Findings ({report.findings.length})
          </span>
          <FindingsTable findings={report.findings} />
        </section>
      )}

      {report.recommendations.length > 0 && (
        <section className="report-section">
          <span className="section-label">
            <ListChecks size={13} /> Recommandations ({report.recommendations.length})
          </span>
          <Recommendations items={report.recommendations} />
        </section>
      )}
    </div>
  )
}

function exposureBadge(exposure: string): BadgeTone {
  return exposureTone(exposure)
}

/** Sockets discovered by netstat, rendered as a compact professional table. */
export function SocketsView({ text, limit = 40 }: { text: string; limit?: number }): React.ReactElement {
  const [showAll, setShowAll] = useState(false)
  const sockets: SocketRow[] = parseSockets(text)
  const summary = parseNetstatSummary(text)

  if (sockets.length === 0) {
    return <pre className="log-block">{text}</pre>
  }

  const visible = showAll ? sockets : sockets.slice(0, limit)
  return (
    <div className="sockets">
      {summary && (
        <div className="stat-row">
          <StatTile label="Sockets" value={summary.total} />
          <StatTile label="localhost" value={summary.localhost ?? 0} />
          <StatTile label="LAN" value={summary.lan ?? 0} tone={summary.lan ? 'accent' : 'neutral'} />
          <StatTile
            label="Toutes interfaces"
            value={summary.allInterfaces ?? 0}
            tone={summary.allInterfaces ? 'warning' : 'neutral'}
          />
        </div>
      )}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Proto</th>
              <th>Adresse</th>
              <th className="num">Port</th>
              <th>État</th>
              <th className="num">PID</th>
              <th>Exposition</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((socket, index) => (
              <tr key={`${socket.protocol}-${socket.address}-${socket.port}-${socket.pid}-${index}`}>
                <td className="mono muted">{socket.protocol}</td>
                <td className="mono truncate">{socket.address}</td>
                <td className="num mono strong">{socket.port}</td>
                <td className="muted">{socket.state.toLowerCase()}</td>
                <td className="num mono">{socket.pid}</td>
                <td>
                  <Badge tone={exposureBadge(socket.exposure)}>{socket.exposure}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sockets.length > limit && (
        <button className="link-button" type="button" onClick={() => setShowAll(value => !value)}>
          {showAll ? 'Réduire' : `Afficher les ${sockets.length} sockets`}
        </button>
      )}
    </div>
  )
}

/** Smart audit/step content: report → structured, netstat → sockets, else text. */
export function StepContent({ content }: { content: string }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const report = /rapport json|report json|"recommendations"|"phases"/i.test(content)
  const netstat = /state=LISTENING|Netstat[^:]*summary/i.test(content)

  if (report) {
    const parsed = parseReportText(content)
    return (
      <details className="disclosure" onToggle={event => setOpen((event.target as HTMLDetailsElement).open)}>
        <summary>
          <FileText size={14} />
          Rapport structuré
          <ChevronDown className="chev" size={14} />
        </summary>
        {open && (parsed ? <StructuredReport report={parsed} /> : <ExpandableText text={content} />)}
      </details>
    )
  }
  if (netstat) {
    return (
      <details className="disclosure" onToggle={event => setOpen((event.target as HTMLDetailsElement).open)}>
        <summary>
          <Network size={14} />
          Sockets réseau
          <ChevronDown className="chev" size={14} />
        </summary>
        {open && <SocketsView text={content} />}
      </details>
    )
  }
  return <ExpandableText text={content} />
}
