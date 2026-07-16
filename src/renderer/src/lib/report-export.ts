import type { AgentReport, ReportFinding, ReportRecommendation } from './report'

/** Word-safe HTML escaping. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: '#8f1d2c',
  HIGH: '#c83f43',
  MEDIUM: '#b77900',
  LOW: '#178a55',
}

function priorityCell(priority?: string): string {
  const key = (priority ?? 'LOW').toUpperCase()
  return `<span style="color:${PRIORITY_COLOR[key] ?? '#5d6b7a'};font-weight:bold;">${esc(key)}</span>`
}

function findingsRows(findings: ReportFinding[]): string {
  if (findings.length === 0) return `<tr><td colspan="7" class="empty">Aucun finding.</td></tr>`
  return findings
    .map(
      finding => `<tr>
      <td class="mono b">${esc(finding.port ?? '—')}</td>
      <td class="mono">${esc((finding.protocol ?? '—').toUpperCase())}</td>
      <td>${esc(finding.service ?? '—')}</td>
      <td>${esc(finding.exposure ?? '—')}</td>
      <td>${esc(finding.version && finding.version !== 'non déterminée' ? finding.version : '—')}</td>
      <td class="num mono">${esc(finding.riskScore ?? 0)}</td>
      <td>${priorityCell(finding.priority)}</td>
    </tr>`,
    )
    .join('')
}

function recommendationRows(items: ReportRecommendation[]): string {
  if (items.length === 0) return `<tr><td colspan="4" class="empty">Aucune recommandation.</td></tr>`
  return [...items]
    .sort((a, b) => (PRIORITY_ORDER[a.priority ?? 'LOW'] ?? 9) - (PRIORITY_ORDER[b.priority ?? 'LOW'] ?? 9))
    .map(
      (item, index) => `<tr>
      <td class="num">${index + 1}</td>
      <td>${priorityCell(item.priority)}</td>
      <td>${esc(item.category ?? '—')}<br><span class="mono small">${esc(item.finding ?? '')}</span></td>
      <td>${esc(item.remediation ?? '—')}</td>
    </tr>`,
    )
    .join('')
}

/** Builds a self-contained, Word-openable HTML document for a report. */
export function buildReportDocument(report: AgentReport, generatedAt = new Date()): string {
  const summary = report.summary ?? {}
  const services = summary.servicesDetected ?? []
  const cves = summary.cveMatched ?? []
  const level = (summary.riskLevel ?? 'LOW').toUpperCase()
  const date = generatedAt.toLocaleString('fr-FR')

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>NEXUS — Rapport de reconnaissance</title>
<style>
  @page { size: A4; margin: 2cm 1.8cm; }
  body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; color: #17212b; }
  h1 { font-size: 20pt; margin: 0 0 4pt; color: #1f5fd8; }
  h2 { font-size: 13pt; margin: 20pt 0 8pt; padding-bottom: 4pt; border-bottom: 1pt solid #d9e2ea; color: #17212b; }
  .sub { color: #5d6b7a; font-size: 10pt; margin: 0 0 2pt; }
  .banner { margin: 12pt 0 4pt; padding: 8pt 10pt; background: #f2f5f7; border-left: 4pt solid #1f5fd8; }
  .banner b { font-size: 12pt; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 4pt; }
  th { background: #eef2f5; border: 0.75pt solid #d9e2ea; padding: 5pt 6pt; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #5d6b7a; }
  td { border: 0.75pt solid #d9e2ea; padding: 5pt 6pt; vertical-align: top; font-size: 9.5pt; }
  td.num, th.num { text-align: right; }
  td.mono, .mono { font-family: Consolas, "Courier New", monospace; }
  td.b { font-weight: bold; }
  .small { font-size: 8.5pt; color: #5d6b7a; }
  .empty { color: #8290a0; font-style: italic; }
  .kv td:first-child { width: 32%; color: #5d6b7a; }
  .foot { margin-top: 18pt; padding-top: 6pt; border-top: 0.75pt solid #d9e2ea; color: #8290a0; font-size: 8.5pt; }
</style>
</head>
<body>
  <h1>NEXUS — Rapport de reconnaissance</h1>
  <p class="sub">Console de cyberdéfense · synthèse automatisée des observations du run</p>

  <div class="banner">
    <b>Niveau de risque global : <span style="color:${PRIORITY_COLOR[level] ?? '#5d6b7a'}">${esc(level)}</span></b>
  </div>

  <h2>1. Contexte</h2>
  <table class="kv">
    <tr><td>Identifiant du run</td><td class="mono">${esc(report.runId ?? '—')}</td></tr>
    <tr><td>Périmètre / cible</td><td class="mono">${esc(report.target && report.target !== '::' ? report.target : 'Hôte local')}</td></tr>
    <tr><td>Date du rapport</td><td>${esc(date)}</td></tr>
    <tr><td>Durée du run</td><td>${report.durationMs ? esc(`${Math.round(report.durationMs / 1000)} s`) : '—'}</td></tr>
  </table>

  <h2>2. Synthèse</h2>
  <table class="kv">
    <tr><td>Ports scannés</td><td>${esc(summary.totalPortsScanned ?? '—')}</td></tr>
    <tr><td>Ports ouverts</td><td>${esc(summary.openPorts ?? report.findings.length)}</td></tr>
    <tr><td>Services détectés</td><td>${services.length > 0 ? esc(services.join(', ')) : '—'}</td></tr>
    <tr><td>CVE corrélées</td><td>${cves.length > 0 ? esc(cves.join(', ')) : 'Aucune'}</td></tr>
    <tr><td>Findings retenus</td><td>${esc(report.findings.length)}</td></tr>
  </table>

  <h2>3. Findings (${esc(report.findings.length)})</h2>
  <table>
    <thead>
      <tr>
        <th>Port</th><th>Proto</th><th>Service</th><th>Exposition</th><th>Version</th><th class="num">Score</th><th>Priorité</th>
      </tr>
    </thead>
    <tbody>${findingsRows(report.findings)}</tbody>
  </table>

  <h2>4. Recommandations (${esc(report.recommendations.length)})</h2>
  <table>
    <thead>
      <tr><th class="num">#</th><th>Priorité</th><th>Catégorie / constat</th><th>Remédiation</th></tr>
    </thead>
    <tbody>${recommendationRows(report.recommendations)}</tbody>
  </table>

  <p class="foot">Généré par NEXUS le ${esc(date)} · Document fondé uniquement sur les observations collectées durant le run. Les findings sans version confirmée doivent être vérifiés avant toute action de remédiation.</p>
</body>
</html>`
}

/** Triggers a browser download of the report as a Word document. */
export function downloadReportWord(report: AgentReport): void {
  const html = buildReportDocument(report)
  // The BOM makes Word read the file as UTF-8.
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  const run = report.runId ? report.runId.slice(0, 8) : 'local'
  link.href = url
  link.download = `nexus-rapport-${run}-${stamp}.doc`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
