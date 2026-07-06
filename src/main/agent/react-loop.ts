import type { ReasoningStep, ReactLoopOptions, ToolCall } from '@shared/types/agent.types'
import type { ToolResult } from '@shared/types/sandbox.types'
import type { ModelProvider } from '@shared/types/model.types'
import { parseSecurityLog } from '../sandbox/parsers/security-log.parser'
import { MemoryManager, type AgentActionMemory } from './memory-manager'
import { buildEnvironmentPrompt } from './prompts/environment'
import { SYSTEM_PROMPT } from './prompts/system'
import { TOOL_USE_PROMPTS } from './prompts/tool-use'
import {
  highestRiskPriority,
  scoreObservedServices,
  type ObservedServiceRiskInput,
  type RiskFinding,
} from './risk-scoring'
import { ToolRegistry } from './tools/registry'

export interface RunReactLoopOptions extends Partial<ReactLoopOptions> {
  provider?: ModelProvider
  signal?: AbortSignal
  /** Number of times a failed provider call is retried before the run aborts. */
  maxProviderRetries?: number
}

const DEFAULT_OPTIONS: ReactLoopOptions = {
  maxSteps: 20,
  timeoutPerStep: 30000,
  totalTimeout: 600000,
  stopConditions: ['FINAL'],
}

const DEFAULT_PROVIDER_RETRIES = 1

export async function* runReactLoop(
  initialPrompt: string,
  tools: ToolRegistry,
  memory: MemoryManager,
  options: RunReactLoopOptions = {}
): AsyncIterable<ReasoningStep> {
  const resolved = { ...DEFAULT_OPTIONS, ...options }
  const started = Date.now()
  let noToolRecoveries = 0

  memory.add('user', initialPrompt)

  if (!options.provider) {
    yield {
      type: 'reason',
      content:
        'Je suis Nexus. Aucun provider IA local n’est connecté pour ce run, donc je m’arrête après cette réponse de diagnostic.',
      metadata: { tokensUsed: 0, durationMs: 0, confidenceScore: 0.5 },
    }
    return
  }

  for (let stepIndex = 0; stepIndex < resolved.maxSteps; stepIndex++) {
    if (options.signal?.aborted) return
    if (Date.now() - started > resolved.totalTimeout) {
      yield {
        type: 'observe',
        content: `Timeout global atteint après ${resolved.totalTimeout}ms.`,
        metadata: { tokensUsed: 0, durationMs: Date.now() - started, confidenceScore: 1 },
      }
      return
    }

    const stepStarted = Date.now()
    const prompt = buildPrompt(initialPrompt, memory, stepIndex, tools)

    let response: { content: string; tokens: number }
    try {
      response = await collectProviderResponse(
        options.provider,
        prompt,
        resolved.timeoutPerStep,
        options.signal,
        options.maxProviderRetries ?? DEFAULT_PROVIDER_RETRIES
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // The provider is unrecoverable for this run: surface the failure as an
      // observation (so it is persisted) and re-throw so the caller marks the
      // run as errored rather than silently completing.
      yield {
        type: 'observe',
        content: `Erreur du provider IA après nouvelles tentatives: ${message}`,
        metadata: { tokensUsed: 0, durationMs: Date.now() - stepStarted, confidenceScore: 0 },
      }
      throw error instanceof Error ? error : new Error(message)
    }

    const modelContent = stripModelObservationSections(response.content)
    const groundedContent = enforceGrounding(modelContent, memory)
    const safeContent =
      groundedContent || 'Réponse modèle vide après suppression d’une observation anticipée.'
    const reasonStep: ReasoningStep = {
      type: 'reason',
      content: safeContent,
      metadata: {
        tokensUsed: response.tokens,
        durationMs: Date.now() - stepStarted,
        confidenceScore: inferConfidence(safeContent),
      },
    }
    yield reasonStep
    memory.add('assistant', safeContent)

    if (shouldStop(safeContent, resolved.stopConditions ?? [])) return

    const toolCall = parseToolCall(safeContent)
    if (!toolCall) {
      if (noToolRecoveries < 1 && shouldRecoverMissingToolCall(safeContent)) {
        noToolRecoveries += 1
        const recovery = [
          'Réponse modèle incomplète ou non exploitable: aucun appel outil JSON et aucun FINAL clair.',
          "Au prochain tour, réponds uniquement avec un bloc JSON d'appel outil valide ou commence par FINAL avec une conclusion fondée sur les observations.",
        ].join(' ')
        memory.add('system', recovery)
        yield {
          type: 'observe',
          content: recovery,
          metadata: { tokensUsed: 0, durationMs: Date.now() - stepStarted, confidenceScore: 0.9 },
        }
        continue
      }

      if (hasToolObservations(memory)) {
        const finalContent = buildNoToolFinal(memory)
        memory.add('assistant', finalContent)
        yield {
          type: 'reason',
          content: finalContent,
          stopReason: 'no_tool',
          metadata: {
            tokensUsed: 0,
            durationMs: Date.now() - started,
            confidenceScore: 1,
          },
        }
        return
      }

      yield {
        type: 'observe',
        content: 'Aucun appel outil détecté. La boucle s’arrête pour éviter une itération vide.',
        stopReason: 'no_tool',
        metadata: { tokensUsed: 0, durationMs: Date.now() - stepStarted, confidenceScore: 0.8 },
      }
      return
    }

    const runningToolCall: ToolCall = { ...toolCall, status: 'running' }
    yield {
      type: 'act',
      content: `Tool ${toolCall.name} demandé.`,
      toolCall: runningToolCall,
      metadata: { tokensUsed: 0, durationMs: 0, confidenceScore: 0.9 },
    }

    let execution: Awaited<ReturnType<ToolRegistry['execute']>>
    try {
      execution = await tools.execute(toolCall)
    } catch (error) {
      // A tool throwing is recoverable: record it as a failed observation and
      // let the loop continue so the model can adapt on the next turn.
      const message = error instanceof Error ? error.message : String(error)
      const failure = `L'exécution de l'outil ${toolCall.name} a échoué: ${message}`
      memory.add('tool', failure)
      yield {
        type: 'observe',
        content: failure,
        toolCall,
        observation: failure,
        metadata: { tokensUsed: 0, durationMs: Date.now() - stepStarted, confidenceScore: 0.3 },
      }
      continue
    }

    const observation = execution.result.observation
    memory.add('tool', observation)
    memory.recordAction(describeToolAction(toolCall, execution.result))

    yield {
      type: 'observe',
      content: observation,
      toolCall: execution.call,
      observation,
      metadata: {
        tokensUsed: 0,
        durationMs: execution.result.durationMs,
        confidenceScore: execution.result.status === 'success' ? 0.9 : 0.6,
      },
    }

    // A denied result means approval was rejected or expired: the high-risk
    // action did NOT run. Stop with an explicit terminal marker so the run is
    // not misreported as a successful completion.
    if (execution.result.status === 'denied') {
      const approvalOutcome = (
        execution.result.metadata as { approvalOutcome?: string } | undefined
      )?.approvalOutcome
      const why =
        approvalOutcome === 'expired'
          ? "l'approbation a expiré sans décision"
          : approvalOutcome === 'rejected'
            ? "l'approbation a été refusée"
            : "l'action a été bloquée par la politique"
      yield {
        type: 'reason',
        content: `FINAL: Run arrêté car ${why}. Aucune action à risque n'a été exécutée.`,
        stopReason: 'blocked',
        metadata: { tokensUsed: 0, durationMs: Date.now() - stepStarted, confidenceScore: 1 },
      }
      return
    }

    if (execution.result.status === 'requires_approval') return
  }

  const finalContent = buildMaxStepsFinal(memory, resolved.maxSteps)
  memory.add('assistant', finalContent)
  yield {
    type: 'reason',
    content: finalContent,
    stopReason: 'max_steps',
    metadata: { tokensUsed: 0, durationMs: Date.now() - started, confidenceScore: 1 },
  }
}

interface TcpProbeObservation {
  target: string
  port: number
  status: 'open' | 'closed' | 'timeout'
}

interface NetstatSocketObservation {
  protocol: string
  address: string
  port: number
  state: string
  pid: number
  exposure: string
  process?: string
}

const SERVICE_HINTS: Record<number, string> = {
  21: 'FTP',
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  135: 'RPC Windows',
  139: 'NetBIOS',
  143: 'IMAP',
  389: 'LDAP',
  443: 'HTTPS',
  445: 'SMB',
  1433: 'SQL Server',
  1434: 'SQL Server Browser',
  1521: 'Oracle',
  2179: 'Hyper-V VM console',
  3000: 'serveur web/dev',
  4000: 'serveur web/dev',
  5000: 'serveur web/dev',
  5173: 'serveur web/dev',
  5432: 'PostgreSQL',
  5433: 'PostgreSQL',
  5900: 'VNC',
  6379: 'Redis',
  8000: 'HTTP alternatif',
  8033: 'HTTP/dev',
  8080: 'HTTP alternatif',
  8081: 'HTTP alternatif',
  9080: 'HTTP alternatif',
  9222: 'Chrome DevTools',
  27017: 'MongoDB',
}

const REPORTABLE_RISK_SCORE = 20

function buildMaxStepsFinal(memory: MemoryManager, maxSteps: number): string {
  return buildGroundedFinal(
    memory,
    `FINAL: Max steps reached (${maxSteps}) avant une conclusion modèle complète. Synthèse automatique fondée uniquement sur les observations reçues.`
  )
}

function buildNoToolFinal(memory: MemoryManager): string {
  return buildGroundedFinal(
    memory,
    "FINAL: La boucle s'arrête car le modèle n'a pas fourni de nouvel appel outil exploitable. Synthèse automatique fondée uniquement sur les observations reçues."
  )
}

function buildGroundedFinal(memory: MemoryManager, lead: string): string {
  const transcript = memory.transcript(80)
  const probes = extractTcpProbeObservations(transcript)
  const sockets = extractNetstatSocketObservations(transcript)
  const processByPid = extractProcessMap(transcript)
  const enrichedSockets = sockets.map((socket) => ({
    ...socket,
    process: socket.process ?? processByPid.get(socket.pid),
  }))
  const riskRelevantSockets = enrichedSockets.filter(isRiskRelevantSocket)
  const observedPorts = new Set([
    ...probes.filter((probe) => probe.status === 'open').map((probe) => probe.port),
    ...riskRelevantSockets.map((socket) => socket.port),
  ])
  const openProbes = probes.filter((probe) => probe.status === 'open')
  const closedProbes = probes.filter((probe) => probe.status === 'closed')
  const externallyBound = enrichedSockets.filter(
    (socket) => socket.exposure === 'all_interfaces' || socket.exposure === 'lan'
  )
  const riskRelevantExternallyBound = externallyBound.filter(isRiskRelevantSocket)
  const localhostOnly = enrichedSockets.filter((socket) => socket.exposure === 'localhost')
  const observedServices = buildObservedServiceRiskInputs(transcript, probes, riskRelevantSockets)
  const riskFindings = scoreObservedServices(observedServices)

  const findings: string[] = []
  if (openProbes.length > 0) {
    findings.push(`Ports TCP ouverts confirmés par probe: ${formatProbeGroups(openProbes)}.`)
  }
  if (closedProbes.length > 0) {
    findings.push(`Ports TCP fermés confirmés par probe: ${formatProbeGroups(closedProbes)}.`)
  }
  if (externallyBound.length > 0) {
    findings.push(`Sockets en écoute LAN/all_interfaces: ${formatSocketList(externallyBound, 10)}.`)
  }
  if (localhostOnly.length > 0) {
    findings.push(`Sockets localhost uniquement: ${formatSocketList(localhostOnly, 8)}.`)
  }
  if (findings.length === 0) {
    findings.push(
      "Aucun port ouvert exploitable n'a été confirmé dans les observations disponibles avant l'arrêt."
    )
  }

  const risks = buildRiskBullets(observedPorts, riskRelevantExternallyBound, riskFindings)
  const recommendations = buildRecommendationBullets(
    observedPorts,
    riskRelevantExternallyBound,
    riskFindings
  )
  const nextActions = [
    'Corréler les PID restants avec tasklist si une écoute importante n’a pas encore de processus identifié.',
    'Tester les services HTTP détectés avec curl en conservant le statut, les en-têtes et un aperçu du corps.',
    'Si le périmètre est autorisé, relancer un scan ciblé sur les IP LAN confirmées plutôt que sur tout le sous-réseau.',
  ]
  const report = buildStructuredFinalReport(
    memory,
    probes,
    riskRelevantSockets,
    riskFindings,
    recommendations
  )

  return [
    lead,
    '',
    'Constats confirmés:',
    ...findings.map((line) => `- ${line}`),
    '',
    'Risques probables:',
    ...risks.map((line) => `- ${line}`),
    '',
    'Recommandations:',
    ...recommendations.map((line) => `- ${line}`),
    '',
    'Prochaines actions sûres:',
    ...nextActions.map((line) => `- ${line}`),
    '',
    'Rapport JSON:',
    JSON.stringify(report, null, 2),
  ].join('\n')
}

function extractTcpProbeObservations(transcript: string): TcpProbeObservation[] {
  const probes: TcpProbeObservation[] = []
  const seen = new Set<string>()
  const pattern = /\b(\[[^\]]+\]|[^\s:\[]+):(\d{1,5})\/tcp\s+(open|closed|timeout)\b/gi
  for (const match of transcript.matchAll(pattern)) {
    const target = stripAddressBrackets(match[1])
    const port = Number(match[2])
    const status = match[3].toLowerCase() as TcpProbeObservation['status']
    const key = `${target}:${port}:${status}`
    if (seen.has(key)) continue
    seen.add(key)
    probes.push({ target, port, status })
  }
  return probes
}

function extractNetstatSocketObservations(transcript: string): NetstatSocketObservation[] {
  const sockets: NetstatSocketObservation[] = []
  const seen = new Set<string>()
  const pattern =
    /\b(TCP|UDP)\s+(\[[^\]]+\]|[^\s:]+):(\d{1,5})\s+state=([A-Z]+)\s+pid=(\d+)\s+exposure=(localhost|lan|all_interfaces|unknown)(?:\s+process=([^\s]+))?/gi
  for (const match of transcript.matchAll(pattern)) {
    const socket = {
      protocol: match[1].toLowerCase(),
      address: stripAddressBrackets(match[2]),
      port: Number(match[3]),
      state: match[4],
      pid: Number(match[5]),
      exposure: match[6],
      process: match[7],
    }
    const key = `${socket.protocol}:${socket.address}:${socket.port}:${socket.pid}`
    if (seen.has(key)) continue
    seen.add(key)
    sockets.push(socket)
  }
  return sockets
}

function extractProcessMap(transcript: string): Map<number, string> {
  const processes = new Map<number, string>()
  const pattern = /\bpid=(\d+)\s+process=([^\s]+)/gi
  for (const match of transcript.matchAll(pattern)) {
    processes.set(Number(match[1]), match[2])
  }
  return processes
}

function buildObservedServiceRiskInputs(
  transcript: string,
  probes: TcpProbeObservation[],
  sockets: NetstatSocketObservation[]
): ObservedServiceRiskInput[] {
  const parsed = parseSecurityLog(transcript)
  const common = {
    cves: parsed.cves,
    vulnerabilityHints: parsed.vulnerabilities,
  }
  const inputs: ObservedServiceRiskInput[] = []

  for (const service of extractServiceObservations(transcript)) {
    inputs.push({ ...service, ...common })
  }

  for (const probe of probes) {
    if (probe.status !== 'open') continue
    inputs.push({
      target: probe.target,
      port: probe.port,
      protocol: 'tcp',
      state: probe.status,
      ...common,
    })
  }

  for (const socket of sockets) {
    if (!isRiskRelevantSocket(socket)) continue
    inputs.push({
      target: socket.address,
      port: socket.port,
      protocol: socket.protocol as 'tcp' | 'udp',
      state: socket.state,
      exposure: socket.exposure as ObservedServiceRiskInput['exposure'],
      ...common,
    })
  }

  return inputs
}

function extractServiceObservations(transcript: string): ObservedServiceRiskInput[] {
  const observations: ObservedServiceRiskInput[] = []
  for (const line of transcript.split(/\r?\n/)) {
    const text = line.replace(/^\[[A-Z]+\]\s*/, '').trim()
    const match = /^(\d{1,5})\/(tcp|udp)\s+(\S+)(?:\s+(\S+))?\s*(.*)$/i.exec(text)
    if (!match) continue

    const port = Number(match[1])
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue

    const state = match[3].toLowerCase()
    if (state !== 'open' && state !== 'filtered') continue

    const service = match[4]
    const version = match[5]?.trim()
    observations.push({
      port,
      protocol: match[2].toLowerCase() as 'tcp' | 'udp',
      state,
      service: service && !service.startsWith('durationMs=') ? service : undefined,
      version: version || undefined,
    })
  }
  return observations
}

function formatProbeGroups(probes: TcpProbeObservation[]): string {
  const byTarget = new Map<string, number[]>()
  for (const probe of probes) {
    const ports = byTarget.get(probe.target) ?? []
    ports.push(probe.port)
    byTarget.set(probe.target, ports)
  }
  return [...byTarget.entries()]
    .map(
      ([target, ports]) =>
        `${target} -> ${ports
          .sort((a, b) => a - b)
          .map(formatPort)
          .join(', ')}`
    )
    .join('; ')
}

function formatSocketList(sockets: NetstatSocketObservation[], limit: number): string {
  const displaySockets = dedupeSocketsForDisplay(sockets)
  const selected = displaySockets
    .slice()
    .sort((a, b) => socketPriority(b) - socketPriority(a) || a.port - b.port)
    .slice(0, limit)
  const suffix =
    displaySockets.length > selected.length
      ? ` (+${displaySockets.length - selected.length} autres)`
      : ''
  return `${selected.map(formatSocket).join(', ')}${suffix}`
}

function dedupeSocketsForDisplay(sockets: NetstatSocketObservation[]): NetstatSocketObservation[] {
  const seen = new Set<string>()
  return sockets.filter((socket) => {
    const addressGroup = socket.exposure === 'all_interfaces' ? 'all_interfaces' : socket.address
    const key = `${socket.protocol}:${addressGroup}:${socket.port}:${socket.pid}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function formatSocket(socket: NetstatSocketObservation): string {
  const process = socket.process ? `/${socket.process}` : ''
  return `${formatBind(socket.address, socket.port)}/${socket.protocol} pid=${socket.pid}${process} exposure=${socket.exposure}`
}

function buildRiskBullets(
  ports: Set<number>,
  externallyBound: NetstatSocketObservation[],
  riskFindings: RiskFinding[]
): string[] {
  const risks: string[] = []
  risks.push(
    ...riskFindings
      .filter((finding) => finding.riskScore >= REPORTABLE_RISK_SCORE)
      .slice(0, 5)
      .map(formatRiskFinding)
  )

  if (externallyBound.length > 0) {
    risks.push(
      'Des services liés à all_interfaces ou à une IP LAN peuvent être joignables depuis le réseau si le pare-feu les autorise.'
    )
  }
  if (hasAnyPort(ports, [5432, 5433, 1433, 27017, 3306, 6379])) {
    risks.push(
      'Des services de base de données détectés localement doivent être considérés sensibles tant que bind, authentification et règles pare-feu ne sont pas vérifiés.'
    )
  }
  if (hasAnyPort(ports, [3000, 4000, 8000, 8033, 8080, 8081, 9080])) {
    risks.push(
      'Des ports web/dev ouverts peuvent exposer des interfaces d’administration ou de développement si elles écoutent hors localhost.'
    )
  }
  if (hasAnyPort(ports, [135, 139, 445])) {
    risks.push(
      'Les services Windows RPC/SMB sont normaux sur Windows, mais ils doivent rester limités aux profils réseau attendus.'
    )
  }
  if (risks.length === 0) {
    risks.push(
      'Aucun risque exploitable n’est confirmé par les observations actuelles; poursuivre avec des probes ciblés plutôt qu’avec des hypothèses.'
    )
  }
  return uniqueStrings(risks)
}

function buildRecommendationBullets(
  ports: Set<number>,
  externallyBound: NetstatSocketObservation[],
  riskFindings: RiskFinding[]
): string[] {
  const recommendations: string[] = []
  recommendations.push(
    ...uniqueStrings(
      riskFindings
        .filter((finding) => finding.riskScore >= REPORTABLE_RISK_SCORE)
        .map((finding) => finding.recommendation)
    ).slice(0, 5)
  )

  if (externallyBound.length > 0) {
    recommendations.push(
      'Limiter les règles entrantes du pare-feu Windows aux IP de confiance ou bloquer les ports qui ne doivent pas être accessibles depuis le LAN.'
    )
    recommendations.push(
      'Pour les services de développement, préférer un bind 127.0.0.1 quand l’accès réseau n’est pas nécessaire.'
    )
  }
  if (hasAnyPort(ports, [5432, 5433])) {
    recommendations.push(
      'Pour PostgreSQL, vérifier listen_addresses, pg_hba.conf, comptes faibles et exposition des ports 5432/5433.'
    )
  }
  if (ports.has(27017)) {
    recommendations.push(
      'Pour MongoDB, vérifier bindIp, authentification, comptes par défaut et exposition du port 27017.'
    )
  }
  if (hasAnyPort(ports, [3000, 4000, 8000, 8033, 8080, 8081, 9080])) {
    recommendations.push(
      'Identifier chaque service HTTP ouvert, relever statut/en-têtes, puis désactiver ou protéger les interfaces inutiles.'
    )
  }
  if (hasAnyPort(ports, [135, 139, 445])) {
    recommendations.push(
      'Vérifier que le partage de fichiers/imprimantes et RPC ne sont autorisés que sur un profil réseau privé maîtrisé.'
    )
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Continuer la collecte non destructive: interfaces réseau, ports écoutants, puis probes ciblés uniquement sur les ports confirmés.'
    )
  }
  return uniqueStrings(recommendations)
}

function formatRiskFinding(finding: RiskFinding): string {
  const target = finding.target ? `${finding.target}:` : ''
  const cves = finding.cveMatched.length ? ` CVE=${finding.cveMatched.join(',')}` : ''
  return `${finding.priority} score=${finding.riskScore}/100 ${target}${finding.port}/${finding.protocol} ${finding.service} exposure=${finding.exposure} version=${finding.version}.${cves} Recommandation: ${finding.recommendation}`
}

function buildStructuredFinalReport(
  memory: MemoryManager,
  probes: TcpProbeObservation[],
  sockets: NetstatSocketObservation[],
  riskFindings: RiskFinding[],
  recommendations: string[]
): Record<string, unknown> {
  const observedPortKeys = new Set([
    ...probes.map((probe) => `${probe.port}/tcp`),
    ...sockets.map((socket) => `${socket.port}/${socket.protocol}`),
  ])
  const openPortKeys = new Set([
    ...probes.filter((probe) => probe.status === 'open').map((probe) => `${probe.port}/tcp`),
    ...sockets.map((socket) => `${socket.port}/${socket.protocol}`),
  ])
  const riskRecommendations = riskFindings
    .filter((finding) => finding.riskScore >= REPORTABLE_RISK_SCORE)
    .map((finding) => ({
      priority: finding.priority,
      category: 'NETWORK',
      finding: `${finding.port}/${finding.protocol} ${finding.service} exposure=${finding.exposure} score=${finding.riskScore}`,
      remediation: finding.recommendation,
    }))
  const genericRecommendations = recommendations.map((line) => ({
    priority: 'MEDIUM',
    category: 'HARDENING',
    finding: line,
    remediation: line,
  }))

  return {
    runId: memory.currentSessionId(),
    target: probes[0]?.target ?? sockets[0]?.address ?? null,
    startTime: null,
    durationMs: null,
    phases: [
      {
        name: 'RECONNAISSANCE',
        steps: uniqueStrings([
          probes.length ? 'TCP probe' : '',
          sockets.length ? 'netstat/listening sockets' : '',
        ]),
        findings: riskFindings.map((finding) => ({
          port: finding.port,
          protocol: finding.protocol,
          service: finding.service,
          version: finding.version,
          exposure: finding.exposure,
          cveMatched: finding.cveMatched,
          riskScore: finding.riskScore,
          priority: finding.priority,
        })),
      },
    ],
    summary: {
      totalPortsScanned: observedPortKeys.size,
      openPorts: openPortKeys.size,
      servicesDetected: uniqueStrings(
        riskFindings.map((finding) => finding.service).filter((service) => service !== 'unknown')
      ),
      cveMatched: uniqueStrings(riskFindings.flatMap((finding) => finding.cveMatched)),
      riskLevel: highestRiskPriority(riskFindings),
    },
    recommendations: dedupeReportRecommendations([
      ...riskRecommendations,
      ...genericRecommendations,
    ]).slice(0, 12),
  }
}

function dedupeReportRecommendations<T extends { remediation: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.remediation.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasAnyPort(ports: Set<number>, candidates: number[]): boolean {
  return candidates.some((port) => ports.has(port))
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function socketPriority(socket: NetstatSocketObservation): number {
  const exposureScore =
    socket.exposure === 'all_interfaces' ? 400 : socket.exposure === 'lan' ? 300 : 100
  const serviceScore = SERVICE_HINTS[socket.port] ? 100 : 0
  const protocolScore = socket.protocol === 'tcp' ? 50 : 0
  return exposureScore + serviceScore + protocolScore
}

function isRiskRelevantSocket(socket: NetstatSocketObservation): boolean {
  if (!Number.isInteger(socket.port) || socket.port < 1 || socket.port > 65535) return false
  const hasServiceHint = SERVICE_HINTS[socket.port] !== undefined
  if (socket.protocol === 'udp') {
    return hasServiceHint && socket.exposure !== 'localhost'
  }
  if (socket.protocol !== 'tcp') return false
  if (hasServiceHint) return true
  if (socket.exposure !== 'all_interfaces' && socket.exposure !== 'lan') return false
  return socket.port < 1024 || socket.port <= 10000
}

function formatPort(port: number): string {
  const label = SERVICE_HINTS[port]
  return label ? `${port} (${label})` : String(port)
}

function formatBind(address: string, port: number): string {
  return address.includes(':') ? `[${address}]:${port}` : `${address}:${port}`
}

function stripAddressBrackets(address: string): string {
  return address.replace(/^\[|\]$/g, '')
}

function describeToolAction(
  call: ToolCall,
  result: ToolResult
): Omit<AgentActionMemory, 'createdAt'> {
  return {
    tool: call.name,
    target: targetFromToolArgs(call.args),
    status: result.status,
    result: result.observation,
  }
}

function targetFromToolArgs(args: Record<string, unknown>): string | undefined {
  for (const key of ['target', 'url', 'path']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const command = args['command']
  if (typeof command === 'string' && command.trim()) return command.trim()
  return undefined
}

function hasToolObservations(memory: MemoryManager): boolean {
  return memory.snapshot(80).some((message) => message.role === 'tool')
}

function buildPrompt(
  initialPrompt: string,
  memory: MemoryManager,
  stepIndex: number,
  tools: ToolRegistry
): string {
  const toolList = tools
    .list()
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n')
  const sessionContext = memory.sessionContext(initialPrompt)
  return [
    SYSTEM_PROMPT,
    buildEnvironmentPrompt(),
    '# Instructions outils',
    TOOL_USE_PROMPTS.shell,
    TOOL_USE_PROMPTS.network,
    TOOL_USE_PROMPTS.nmap,
    TOOL_USE_PROMPTS.gobuster,
    TOOL_USE_PROMPTS.sqlmap,
    TOOL_USE_PROMPTS.filesystem,
    '# Outils enregistrés',
    toolList,
    '# Tâche initiale',
    initialPrompt,
    sessionContext ? `# Contexte de session\n${sessionContext}` : '',
    '# Mémoire récente',
    memory.transcript(),
    `# Tour ReAct courant: ${stepIndex + 1}`,
    'Réponds avec ton raisonnement. Si une action est nécessaire, ajoute exactement un bloc JSON d’appel outil.',
  ].join('\n\n')
}

async function collectProviderResponse(
  provider: ModelProvider,
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal,
  maxRetries = 0
): Promise<{ content: string; tokens: number }> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) return { content: '', tokens: 0 }
    try {
      return await streamOnce(provider, prompt, timeoutMs, signal)
    } catch (error) {
      lastError = error
      if (attempt < maxRetries && !signal?.aborted) {
        // Exponential backoff (250ms, 500ms, ...) between provider retries.
        await delay(250 * 2 ** attempt, signal)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function streamOnce(
  provider: ModelProvider,
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ content: string; tokens: number }> {
  const started = Date.now()
  let content = ''
  let tokens = 0

  for await (const chunk of provider.chatStream(prompt, { timeoutMs })) {
    if (signal?.aborted) break
    content += chunk.delta
    tokens = chunk.cumulativeTokens
    if (Date.now() - started > timeoutMs) break
  }

  return { content: content.trim(), tokens }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

function parseToolCall(content: string): ToolCall | null {
  for (const jsonCandidate of extractJsonCandidates(content)) {
    try {
      const parsed = JSON.parse(jsonCandidate) as {
        tool?: string
        name?: string
        args?: Record<string, unknown>
      }
      const tool = parsed.tool ?? parsed.name
      if (tool) {
        return {
          id: crypto.randomUUID(),
          name: tool,
          args: parsed.args ?? {},
          status: 'pending',
        }
      }
    } catch {
      // Try the next candidate before falling through to markdown parsing.
    }
  }

  const toolMatch =
    content.match(/\*\*?Tool:\*\*?\s*([^\n\r]+)/i) ?? content.match(/Tool:\s*([^\n\r]+)/i)
  const commandMatch =
    content.match(/\*\*?Command:\*\*?\s*([^\n\r]+)/i) ?? content.match(/Command:\s*([^\n\r]+)/i)
  if (!toolMatch) return null

  return {
    id: crypto.randomUUID(),
    name: toolMatch[1].trim(),
    args: commandMatch ? { command: commandMatch[1].trim() } : {},
    status: 'pending',
  }
}

function extractJsonCandidates(content: string): string[] {
  const candidates: string[] = []
  const fencedPattern = /(?:```|~~~)json\s*([\s\S]*?)(?:```|~~~)/gi
  for (const match of content.matchAll(fencedPattern)) {
    const candidate = match[1]?.trim()
    if (candidate) candidates.push(candidate)
  }
  candidates.push(...extractBalancedJsonObjects(content))
  return uniqueStrings(candidates)
}

function extractBalancedJsonObjects(content: string): string[] {
  const objects: string[] = []
  let start = -1
  let depth = 0
  let quote: '"' | null = null
  let escaping = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]

    if (quote) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"') {
      quote = char
      continue
    }

    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }

    if (char !== '}' || depth === 0) continue
    depth -= 1
    if (depth === 0 && start !== -1) {
      objects.push(content.slice(start, index + 1).trim())
      start = -1
    }
  }

  return objects
}

function shouldStop(content: string, stopConditions: string[]): boolean {
  const normalized = content.trim()
  return stopConditions.some((condition) => matchesStopCondition(normalized, condition))
}

function matchesStopCondition(content: string, condition: string): boolean {
  if (condition.toLowerCase() === 'final') {
    return /^#{0,6}\s*FINAL\b/i.test(content) || /[.!?]\s+FINAL\b/i.test(content)
  }

  const escaped = condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(content)
}

function stripModelObservationSections(content: string): string {
  const lines = content.split(/\r?\n/)
  const kept: string[] = []
  let skippingObservation = false

  for (const line of lines) {
    if (isObservationHeading(line)) {
      skippingObservation = true
      continue
    }

    if (skippingObservation && resumesModelOutput(line)) {
      skippingObservation = false
    }

    if (skippingObservation) continue
    if (/^\s*OBSERVATION\s*:/i.test(line)) continue
    kept.push(line)
  }

  return kept.join('\n').trim()
}

function isObservationHeading(line: string): boolean {
  return /^#{0,6}\s*OBSERVATION\b\s*:?\s*/i.test(line.trim())
}

function resumesModelOutput(line: string): boolean {
  const trimmed = line.trim()
  return (
    /^#{0,6}\s*(REASONING|ACTION|FINAL)\b/i.test(trimmed) ||
    /^```json\b/i.test(trimmed) ||
    trimmed.startsWith('{')
  )
}

function enforceGrounding(content: string, memory: MemoryManager): string {
  const transcript = memory.transcript(50).toLowerCase()
  const windowsGrounded = content.replace(
    /\bWindows\s+(?:10|11)(?:\s+(?:Pro|Home|Enterprise|Education|Professional))?\b/gi,
    (match) => {
      if (transcript.includes(match.toLowerCase())) return match
      return 'Windows (produit/édition non déterminé par les observations)'
    }
  )
  return enforceVulnerabilityGrounding(windowsGrounded, transcript)
}

function enforceVulnerabilityGrounding(content: string, transcript: string): string {
  if (hasExplicitVulnerabilityEvidence(transcript)) return content
  return content
    .replace(/\bCVE-\d{4}-\d{4,7}\b/gi, 'CVE non déterminée')
    .replace(/\b(?:RCE|Remote Code Execution)\b/gi, 'vulnérabilité non déterminée')
}

function hasExplicitVulnerabilityEvidence(transcript: string): boolean {
  return /\bcve-\d{4}-\d{4,7}\b|\bvulnerab(?:ility|ilité|ilite)\b|\bexploit\b|\bversion\s*=|\bserver:\s+\S+\/\d|\bservice=.*\d/i.test(
    transcript
  )
}

function shouldRecoverMissingToolCall(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed || /^FINAL\b/i.test(trimmed)) return false
  if (hasUnclosedJsonFence(trimmed)) return true
  if (!/[.!?)}\]`]$/.test(trimmed)) return true
  return /\b(je\s+(vais|commence)|commande|outil|exécut|corréler|cartographier|inventorier|identifier)\b/i.test(
    trimmed
  )
}

function hasUnclosedJsonFence(content: string): boolean {
  const fences = content.match(/```/g)
  return !!fences && fences.length % 2 === 1
}

function inferConfidence(content: string): number {
  if (/incertain|unknown|je ne sais pas/i.test(content)) return 0.4
  if (/FINAL|Conclusion/i.test(content)) return 0.95
  return 0.75
}
