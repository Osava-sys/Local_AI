import type { AgentRunStep, AgentState } from '@shared/types/agent.types'
import type { ApprovalRequestView } from '@shared/types/approval.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import type {
  ExecutionEdgeStatus,
  ExecutionGraphBlock,
  ExecutionGraphEdge,
  ExecutionGraphFilter,
  ExecutionGraphNode,
  ExecutionGraphSnapshot,
  ExecutionNodeKind,
  ExecutionNodePosition,
  ExecutionNodeStatus,
  ExecutionPort,
  ExecutionPortDataType,
  ExecutionRiskLevel,
} from '@shared/types/execution-graph.types'

/** Node geometry. Exported so the canvas measures with the same numbers the layout was built from. */
export const EXECUTION_NODE_WIDTH = 186
export const EXECUTION_NODE_HEIGHT = 108

/** Space kept inside a block frame; `top` clears the block header pill. */
export const EXECUTION_BLOCK_PADDING = { top: 44, right: 20, bottom: 20, left: 20 } as const

/** Space kept between the outermost content and the world edge. */
export const EXECUTION_WORLD_MARGIN = 48

const NODE_WIDTH = EXECUTION_NODE_WIDTH
const NODE_HEIGHT = EXECUTION_NODE_HEIGHT
const CYCLE_HEIGHT = 320
const CYCLE_GAP = 28

/**
 * Column grid of a ReAct cycle. The forward path runs left to right on the top row,
 * the return path (result, evidence, resume) runs right to left on the bottom row.
 */
const CYCLE_COLUMN = { decide: 544, intent: 758, policy: 972, gate: 1186 } as const
const CYCLE_ROW = { forward: 68, ret: 192 } as const

/** The evidence column sits to the right of the widest cycle. */
const ANALYSIS_X = 1484
const ANALYSIS_ROW_GAP = 136
const ANALYSIS_SPAN = ANALYSIS_ROW_GAP * 2 + NODE_HEIGHT

/** Statuses that make a node part of the live front. */
export const LIVE_STATUSES: readonly ExecutionNodeStatus[] = [
  'active',
  'running',
  'awaiting_approval',
  'blocked',
  'error',
]

const RUNNING_STATUSES: readonly ExecutionNodeStatus[] = ['active', 'running', 'awaiting_approval']

export interface ExecutionBlockFrame {
  position: ExecutionNodePosition
  width: number
  height: number
}

/**
 * Bounding frame of a set of nodes, padded for the block chrome.
 *
 * Block geometry is always derived from the nodes it holds — never authored — so a frame
 * cannot drift out of sync with its contents when the layout changes, when a filter hides
 * members, or when the operator drags a node.
 */
export function executionBlockFrame(
  positions: readonly ExecutionNodePosition[]
): ExecutionBlockFrame | undefined {
  if (positions.length === 0) return undefined
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const position of positions) {
    minX = Math.min(minX, position.x)
    minY = Math.min(minY, position.y)
    maxX = Math.max(maxX, position.x + NODE_WIDTH)
    maxY = Math.max(maxY, position.y + NODE_HEIGHT)
  }
  return {
    position: {
      x: minX - EXECUTION_BLOCK_PADDING.left,
      y: minY - EXECUTION_BLOCK_PADDING.top,
    },
    width: maxX - minX + EXECUTION_BLOCK_PADDING.left + EXECUTION_BLOCK_PADDING.right,
    height: maxY - minY + EXECUTION_BLOCK_PADDING.top + EXECUTION_BLOCK_PADDING.bottom,
  }
}

export interface BuildExecutionGraphInput {
  prompt: string
  currentRunId: string | null
  state: AgentState | 'starting'
  steps: AgentRunStep[]
  error: string | null
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: ApprovalRequestView[]
  recentApprovals: ApprovalRequestView[]
  isDemo?: boolean
  totalStepCount?: number
}

interface Cycle {
  id: string
  index: number
  reason?: IndexedStep
  action?: IndexedStep
  observation?: IndexedStep
}

interface IndexedStep {
  step: AgentRunStep
  index: number
  id: string
}

interface GraphDraft {
  nodes: ExecutionGraphNode[]
  edges: ExecutionGraphEdge[]
  blocks: ExecutionGraphBlock[]
}

/** Build a deterministic, renderer-neutral execution graph from the event stream. */
export function buildExecutionGraph(input: BuildExecutionGraphInput): ExecutionGraphSnapshot {
  const runId = input.currentRunId ?? undefined
  const isDemo = input.isDemo ?? false
  const totalStepCount = input.totalStepCount ?? input.steps.length
  const cycles = groupCycles(input.steps)
  const draft: GraphDraft = { nodes: [], edges: [], blocks: [] }
  const missionY = 72
  const cycleStartY = 48
  const traceHeight = Math.max(
    620,
    cycleStartY + Math.max(1, cycles.length) * (CYCLE_HEIGHT + CYCLE_GAP) + 32
  )
  // The evidence column reads as a synthesis of the whole trace, so centre it on the trace.
  const analysisY = Math.max(114, traceHeight / 2 - ANALYSIS_SPAN / 2)
  const allApprovals = [...input.pendingApprovals, ...input.recentApprovals]
  const usedApprovalIds = new Set<string>()
  const globalRisk = graphRiskScore(allApprovals, input.steps, isDemo)

  const promptNode = makeNode({
    id: 'mission:prompt',
    definitionId: 'user-prompt',
    runId,
    blockId: 'mission',
    kind: 'input',
    title: 'Mission',
    summary: trim(input.prompt || 'Nouvelle mission', 42),
    description: "Objectif et contraintes fournis par l'utilisateur.",
    status: input.state === 'idle' ? 'pending' : 'done',
    sequence: 0,
    position: { x: 76, y: missionY + 66 },
    inputs: [],
    outputs: [port('prompt', 'Mission', 'output', 'prompt')],
    riskScore: 0,
    data: { prompt: input.prompt, runId: runId ?? null },
    recommendations: ['Définir une cible, une portée et une condition d’arrêt explicites.'],
  })
  const agentNode = makeNode({
    id: 'mission:agent',
    definitionId: 'nexus-agent',
    runId,
    blockId: 'mission',
    kind: 'agent',
    title: 'Agent NEXUS',
    summary: input.modelStatus?.modelName ?? 'modèle local',
    description: 'Orchestre le cycle décision, action et observation.',
    status: agentStatus(input.state),
    sequence: 1,
    position: { x: 278, y: missionY + 66 },
    inputs: [
      port('mission', 'Mission', 'input', 'prompt'),
      port('context', 'Contexte', 'input', 'context'),
    ],
    outputs: [port('control', 'Contrôle', 'output', 'control')],
    riskScore: 8,
    data: { model: input.modelStatus?.modelName ?? null, state: input.state },
    recommendations: ['Conserver une limite de pas et un timeout global.'],
  })
  const memoryNode = makeNode({
    id: 'mission:memory',
    definitionId: 'session-memory',
    runId,
    blockId: 'mission',
    kind: 'memory',
    title: 'Mémoire sourcée',
    summary: `${input.steps.filter(isObservation).length} observation(s)`,
    description: 'Contexte de session alimenté uniquement par les observations persistées.',
    status: input.steps.some(isObservation) ? 'done' : 'pending',
    sequence: 2,
    position: { x: 176, y: missionY + 202 },
    inputs: [port('evidence', 'Observations', 'input', 'observation')],
    outputs: [port('context', 'Contexte sourcé', 'output', 'context')],
    riskScore: 4,
    data: {
      source: 'run transcript',
      observations: input.steps.filter(isObservation).length,
    },
    recommendations: ['Afficher la provenance de chaque fait réutilisé.'],
  })
  draft.nodes.push(promptNode, agentNode, memoryNode)
  addEdge(draft, promptNode, agentNode, 'data', 'mission', 'prompt', 'mission', input.prompt)
  addEdge(draft, memoryNode, agentNode, 'context', 'mémoire', 'context', 'context')

  draft.blocks.push(
    makeBlock(
      {
        id: 'mission',
        definitionId: 'nexus.mission-context',
        version: 1,
        title: 'Mission & contexte',
        description: 'Entrée utilisateur, modèle actif et mémoire de session.',
        sequence: 0,
        collapsible: true,
      },
      [promptNode, agentNode, memoryNode]
    )
  )

  let previousControlNode = agentNode
  let lastObservationNode: ExecutionGraphNode | undefined
  cycles.forEach((cycle) => {
    const cycleY = cycleStartY + cycle.index * (CYCLE_HEIGHT + CYCLE_GAP)
    const blockId = cycle.id
    const cycleNodes: ExecutionGraphNode[] = []
    const reasonStatus = cycle.reason
      ? runtimeStepStatus(cycle.reason, input.steps, input.state, totalStepCount)
      : 'skipped'
    const decisionNode = makeNode({
      id: `${blockId}:decision`,
      definitionId: 'agent-decision',
      runId,
      blockId,
      kind: 'decision',
      title: `Décision ${pad(cycle.index + 1)}`,
      summary: trim(cycle.reason?.step.content ?? 'Action directe', 34),
      description: 'Résumé décisionnel observable. Il ne révèle pas une chaîne de pensée interne.',
      status: reasonStatus,
      sequence: 10 + cycle.index * 10,
      position: { x: CYCLE_COLUMN.decide, y: cycleY + CYCLE_ROW.forward },
      inputs: [
        port('control', 'Contrôle', 'input', 'control'),
        port('context', 'Contexte', 'input', 'context'),
      ],
      outputs: [port('decision', 'Décision', 'output', 'control')],
      sourceStepIds: cycle.reason ? [cycle.reason.id] : [],
      startedAt: cycle.reason?.step.timestamp,
      durationMs: cycle.reason?.step.metadata?.durationMs,
      confidenceScore: cycle.reason?.step.metadata?.confidenceScore,
      riskScore: 10,
      data: cycle.reason ? stepData(cycle.reason.step) : { skipped: true },
      recommendations: ['Présenter une justification concise et les preuves utilisées.'],
    })
    cycleNodes.push(decisionNode)
    addEdge(
      draft,
      previousControlNode,
      decisionNode,
      'control',
      'prochaine étape',
      'control',
      'control'
    )
    addEdge(draft, memoryNode, decisionNode, 'context', 'contexte sourcé', 'context', 'context')

    let cycleTail = decisionNode
    let sandboxNode: ExecutionGraphNode | undefined
    let cycleTool: string | undefined
    let cycleTarget: string | undefined
    if (cycle.action) {
      const action = cycle.action.step
      const toolName = action.toolCall?.name ?? 'outil'
      const target = inferTarget(action)
      const actionRisk = actionRiskScore(action, allApprovals, isDemo)
      cycleTool = toolName
      cycleTarget = target
      const toolNode = makeNode({
        id: `${blockId}:tool`,
        definitionId: `tool-intent:${toolName}`,
        runId,
        blockId,
        kind: 'tool',
        title: `Intention · ${toolName}`,
        summary: target ? trim(target, 32) : trim(action.content, 32),
        description: 'Intention typée rendue visible avant toute exécution.',
        status: toolIntentStatus(action),
        sequence: decisionNode.sequence + 1,
        position: { x: CYCLE_COLUMN.intent, y: cycleY + CYCLE_ROW.forward },
        inputs: [port('decision', 'Décision', 'input', 'control')],
        outputs: [port('intent', 'Intention', 'output', 'intent')],
        sourceStepIds: [cycle.action.id],
        startedAt: action.timestamp,
        durationMs: action.metadata?.durationMs,
        confidenceScore: action.metadata?.confidenceScore,
        riskScore: actionRisk,
        tool: toolName,
        target,
        data: stepData(action),
        recommendations: ['Inspecter la cible et les arguments avant exécution.'],
      })
      const policyNode = makeNode({
        id: `${blockId}:policy`,
        definitionId: 'approval-policy-gate',
        runId,
        blockId,
        kind: 'policy',
        title: 'Contrôle de politique',
        summary:
          action.toolCall?.status === 'requires_approval' ? 'escalade humaine' : 'route autorisée',
        description: 'Évalue le périmètre et le risque avant le passage vers la sandbox.',
        status: action.toolCall ? 'done' : 'pending',
        sequence: decisionNode.sequence + 2,
        position: { x: CYCLE_COLUMN.policy, y: cycleY + CYCLE_ROW.forward },
        inputs: [port('intent', 'Intention', 'input', 'intent')],
        outputs: [port('decision', 'Décision', 'output', 'approval')],
        sourceStepIds: [cycle.action.id],
        riskScore: actionRisk,
        tool: toolName,
        target,
        data: {
          toolCallId: action.toolCall?.id ?? null,
          decision:
            action.toolCall?.status === 'requires_approval' ? 'needs_human_approval' : 'allow',
        },
        recommendations: ['Ne jamais autoriser une action inconnue par défaut.'],
      })
      cycleNodes.push(toolNode, policyNode)
      addEdge(draft, decisionNode, toolNode, 'control', 'action minimale', 'decision', 'decision')
      addEdge(draft, toolNode, policyNode, 'data', 'intention typée', 'intent', 'intent', toolName)
      cycleTail = policyNode

      const approval = findApproval(action, allApprovals, usedApprovalIds, runId)
      const needsApproval = action.toolCall?.status === 'requires_approval' || Boolean(approval)
      let approvalNode: ExecutionGraphNode | undefined
      if (needsApproval) {
        approvalNode = makeNode({
          id: `${blockId}:approval`,
          definitionId: 'human-approval-gate',
          runId,
          blockId,
          kind: 'approval',
          title: 'Approbation humaine',
          summary: approvalSummary(approval),
          description: approval?.reason ?? 'Une validation humaine est requise avant cette action.',
          status: approvalStatus(approval),
          sequence: decisionNode.sequence + 3,
          position: { x: CYCLE_COLUMN.gate, y: cycleY + CYCLE_ROW.forward },
          inputs: [port('policy', 'Décision politique', 'input', 'approval')],
          outputs: [port('approval', 'Décision humaine', 'output', 'approval')],
          sourceStepIds: [cycle.action.id],
          startedAt: parseTimestamp(approval?.createdAt) ?? action.timestamp,
          completedAt: parseTimestamp(approval?.decidedAt),
          riskScore: riskFromApproval(approval) ?? actionRisk,
          tool: toolName,
          target: approval?.summary ?? target,
          data: approval
            ? { ...approval }
            : {
                status: 'pending',
                toolCallId: action.toolCall?.id ?? null,
                requiresApproval: true,
              },
          recommendations: ['Vérifier cible, portée, réversibilité et durée avant décision.'],
        })
        cycleNodes.push(approvalNode)
        addEdge(
          draft,
          policyNode,
          approvalNode,
          'condition',
          'approbation requise',
          'decision',
          'policy',
          undefined,
          'risk >= policy threshold'
        )
        cycleTail = approvalNode
      }

      // The sandbox sits under whichever gate actually authorised it.
      const sandboxX = needsApproval ? CYCLE_COLUMN.gate : CYCLE_COLUMN.policy
      sandboxNode = makeNode({
        id: `${blockId}:sandbox`,
        definitionId: 'sandbox-execution',
        runId,
        blockId,
        kind: 'sandbox',
        title: 'Exécution isolée',
        summary: sandboxSummary(action),
        description: 'Exécution bornée par politique, périmètre, timeout et audit.',
        status: sandboxStatus(action, approval),
        sequence: decisionNode.sequence + 4,
        position: { x: sandboxX, y: cycleY + CYCLE_ROW.ret },
        inputs: [port('intent', 'Intention autorisée', 'input', 'intent')],
        outputs: [port('artifact', 'Résultat brut', 'output', 'artifact')],
        sourceStepIds: [cycle.action.id],
        startedAt: action.timestamp,
        durationMs: action.metadata?.durationMs,
        riskScore: actionRisk,
        tool: toolName,
        target,
        data: {
          status: action.toolCall?.status ?? 'pending',
          isolation: ['allowlist', 'timeout', 'bounded-output'],
          toolCallId: action.toolCall?.id ?? null,
        },
        recommendations: ['Conserver les limites et l’audit pour chaque tentative.'],
      })
      cycleNodes.push(sandboxNode)
      addEdge(
        draft,
        approvalNode ?? policyNode,
        sandboxNode,
        'condition',
        approvalNode ? approvalEdgeLabel(approval) : 'autorisé',
        approvalNode ? 'approval' : 'decision',
        'intent',
        undefined,
        approvalNode ? 'approved' : 'policy=allow'
      )
      cycleTail = sandboxNode
    }

    // An observation is evidence in its own right: it is graphed whether or not this cycle
    // reached the sandbox, otherwise a reason/observe pair would silently vanish from the trace.
    if (cycle.observation) {
      const observation = cycle.observation.step
      const observationNode = makeNode({
        id: `${blockId}:observation`,
        definitionId: 'sandbox-observation',
        runId,
        blockId,
        kind: 'observation',
        title: `Observation ${pad(cycle.index + 1)}`,
        summary: trim(observation.observation ?? observation.content, 34),
        description: sandboxNode
          ? 'Sortie réellement observée et persistée après exécution.'
          : 'Observation persistée sans exécution d’outil dans ce cycle.',
        status: runtimeStepStatus(cycle.observation, input.steps, input.state, totalStepCount),
        sequence: decisionNode.sequence + 5,
        position: { x: CYCLE_COLUMN.intent, y: cycleY + CYCLE_ROW.ret },
        inputs: [
          sandboxNode
            ? port('artifact', 'Résultat', 'input', 'artifact')
            : port('control', 'Décision', 'input', 'control'),
        ],
        outputs: [port('observation', 'Observation', 'output', 'observation')],
        sourceStepIds: [cycle.observation.id],
        startedAt: observation.timestamp,
        durationMs: observation.metadata?.durationMs,
        confidenceScore: observation.metadata?.confidenceScore,
        riskScore: observationRisk(observation),
        tool: cycleTool,
        target: cycleTarget,
        data: stepData(observation),
        recommendations: ['Distinguer strictement observation, interprétation et hypothèse.'],
      })
      const checkpointNode = makeNode({
        id: `${blockId}:checkpoint`,
        definitionId: 'run-checkpoint',
        runId,
        blockId,
        kind: 'checkpoint',
        title: `Point de reprise ${pad(cycle.index + 1)}`,
        summary: cycleTool ? `après ${cycleTool}` : 'après observation',
        description: 'Frontière sûre pour inspecter ou reprendre la trace du run.',
        status: 'done',
        sequence: decisionNode.sequence + 6,
        position: { x: CYCLE_COLUMN.decide, y: cycleY + CYCLE_ROW.ret },
        inputs: [port('evidence', 'Preuve', 'input', 'observation')],
        outputs: [port('control', 'Reprise', 'output', 'control')],
        sourceStepIds: [cycle.observation.id],
        startedAt: observation.timestamp,
        riskScore: 5,
        data: { visualReplayOnly: true, stepIndex: cycle.observation.index + 1 },
        recommendations: ['La relecture visuelle ne réexécute jamais l’outil.'],
      })
      cycleNodes.push(observationNode, checkpointNode)
      addEdge(
        draft,
        sandboxNode ?? decisionNode,
        observationNode,
        sandboxNode ? 'data' : 'control',
        sandboxNode ? 'sortie bornée' : 'observation directe',
        sandboxNode ? 'artifact' : 'decision',
        sandboxNode ? 'artifact' : 'control',
        observation.content
      )
      addEdge(
        draft,
        observationNode,
        checkpointNode,
        'evidence',
        'preuve persistée',
        'observation',
        'evidence'
      )
      addEdge(
        draft,
        observationNode,
        memoryNode,
        'context',
        'mémorisation sourcée',
        'observation',
        'evidence'
      )
      cycleTail = checkpointNode
      lastObservationNode = observationNode
    }

    previousControlNode = cycleTail
    draft.nodes.push(...cycleNodes)
    draft.blocks.push(
      makeBlock(
        {
          id: blockId,
          definitionId: 'nexus.react-cycle',
          version: 1,
          title: `Cycle ${pad(cycle.index + 1)}`,
          description: cycle.action?.step.toolCall?.name
            ? `Décision, politique et exécution de ${cycle.action.step.toolCall.name}.`
            : 'Cycle de décision sans appel d’outil.',
          sequence: cycle.index + 1,
          collapsible: true,
        },
        cycleNodes
      )
    )
  })

  const verifierNode = makeNode({
    id: 'analysis:verifier',
    definitionId: 'evidence-grounding-guard',
    runId,
    blockId: 'analysis',
    kind: 'verifier',
    title: 'Contrôle des preuves',
    summary: lastObservationNode ? 'observations vérifiables' : 'en attente de preuve',
    description: 'Empêche une hypothèse ou une observation anticipée de devenir un fait.',
    status: lastObservationNode ? 'done' : input.error ? 'error' : 'pending',
    sequence: 900,
    position: { x: ANALYSIS_X, y: analysisY },
    inputs: [port('evidence', 'Observations', 'input', 'evidence')],
    outputs: [port('verified', 'Preuves validées', 'output', 'evidence')],
    sourceStepIds: lastObservationNode?.sourceStepIds ?? [],
    riskScore: 12,
    data: {
      observations: input.steps.filter(isObservation).length,
      grounded: Boolean(lastObservationNode),
    },
    recommendations: ['Toute affirmation factuelle doit conserver sa provenance.'],
  })
  const findingNode = makeNode({
    id: 'analysis:finding',
    definitionId: 'risk-finding',
    runId,
    blockId: 'analysis',
    kind: 'finding',
    title: 'Constats priorisés',
    summary: lastObservationNode ? riskSummary(globalRisk) : 'analyse en attente',
    description: 'Classe les constats selon la force des preuves disponibles.',
    status: lastObservationNode ? 'done' : 'pending',
    sequence: 901,
    position: { x: ANALYSIS_X, y: analysisY + ANALYSIS_ROW_GAP },
    inputs: [port('evidence', 'Preuves', 'input', 'evidence')],
    outputs: [port('finding', 'Constats', 'output', 'finding')],
    sourceStepIds: lastObservationNode?.sourceStepIds ?? [],
    riskScore: globalRisk,
    data: { riskScore: globalRisk, level: riskLevel(globalRisk) },
    recommendations: ['Ne jamais promouvoir une hypothèse en constat confirmé.'],
  })
  const reportNode = makeNode({
    id: 'analysis:report',
    definitionId: 'final-report',
    runId,
    blockId: 'analysis',
    kind: 'report',
    title: 'Rapport final',
    summary: reportSummary(input.state, input.steps.length, totalStepCount),
    description: 'Synthèse des preuves, décisions humaines et risques résiduels.',
    status: reportStatus(input.state, input.steps.length, totalStepCount),
    sequence: 902,
    position: { x: ANALYSIS_X, y: analysisY + ANALYSIS_ROW_GAP * 2 },
    inputs: [port('findings', 'Constats', 'input', 'finding')],
    outputs: [port('report', 'Rapport', 'output', 'report')],
    sourceStepIds: input.steps.map((step, index) => stableStepId(step, index)),
    durationMs: runDuration(input.steps),
    riskScore: globalRisk,
    data: {
      runId: runId ?? null,
      state: input.state,
      steps: input.steps.length,
      totalSteps: totalStepCount,
      error: input.error,
    },
    recommendations: ['Inclure les limites de l’analyse et le risque résiduel.'],
  })
  draft.nodes.push(verifierNode, findingNode, reportNode)
  if (lastObservationNode) {
    addEdge(
      draft,
      lastObservationNode,
      verifierNode,
      'evidence',
      'observation réelle',
      'observation',
      'evidence'
    )
  } else {
    addEdge(
      draft,
      previousControlNode,
      verifierNode,
      'control',
      'fin de trace',
      'control',
      'evidence'
    )
  }
  addEdge(draft, verifierNode, findingNode, 'evidence', 'preuves vérifiées', 'verified', 'evidence')
  addEdge(draft, findingNode, reportNode, 'data', 'constats priorisés', 'finding', 'findings')
  draft.blocks.push(
    makeBlock(
      {
        id: 'analysis',
        definitionId: 'nexus.evidence-reporting',
        version: 1,
        title: 'Preuves & synthèse',
        description: 'Vérification, priorisation et rapport final.',
        sequence: cycles.length + 1,
        collapsible: true,
      },
      [verifierNode, findingNode, reportNode]
    )
  )

  const nodeById = new Map(draft.nodes.map((node) => [node.id, node]))
  draft.edges = draft.edges.map((edge) => ({
    ...edge,
    status: edgeRuntimeStatus(edge, nodeById),
  }))

  return {
    id: `execution-graph:${runId ?? 'draft'}:${input.steps.length}`,
    runId,
    generatedAt: Date.now(),
    state: input.state,
    isDemo,
    visibleStepCount: input.steps.length,
    totalStepCount,
    nodes: draft.nodes,
    edges: dedupeEdges(draft.edges),
    blocks: draft.blocks,
    world: worldSize(draft.nodes, draft.blocks),
  }
}

/**
 * Project a snapshot for focus filters and collapsed blocks without changing the
 * source graph. Collapsed blocks become one synthetic, inspectable summary node.
 */
export function projectExecutionGraph(
  graph: ExecutionGraphSnapshot,
  filter: ExecutionGraphFilter,
  collapsedBlockIds: ReadonlySet<string>
): ExecutionGraphSnapshot {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const retained = filterNodeIds(graph, filter)
  const replacement = new Map<string, string>()
  const summaryNodes: ExecutionGraphNode[] = []

  for (const block of graph.blocks) {
    if (!collapsedBlockIds.has(block.id)) continue
    const members = block.nodeIds.map((id) => nodeById.get(id)).filter(isDefined)
    if (members.length === 0) continue
    const summaryId = `block-summary:${block.id}`
    for (const member of members) {
      replacement.set(member.id, summaryId)
      retained.delete(member.id)
    }
    retained.add(summaryId)
    const frame = executionBlockFrame(members.map((node) => node.position))
    summaryNodes.push(
      makeNode({
        id: summaryId,
        definitionId: `block-summary:${block.id}`,
        runId: graph.runId,
        blockId: block.id,
        kind: block.id === 'analysis' ? 'report' : block.id === 'mission' ? 'agent' : 'checkpoint',
        title: block.title,
        summary: `${members.length} nœuds · ${statusLabel(block.status)}`,
        description: block.description,
        status: block.status,
        sequence: block.sequence,
        // Sit the summary where the block's centre of mass was, so collapsing reads
        // as a fold rather than a jump.
        position: frame
          ? {
              x: frame.position.x + (frame.width - NODE_WIDTH) / 2,
              y: frame.position.y + (frame.height - NODE_HEIGHT) / 2,
            }
          : block.position,
        inputs: [port('in', 'Entrée du bloc', 'input', 'control')],
        outputs: [port('out', 'Sortie du bloc', 'output', 'control')],
        sourceStepIds: [...new Set(members.flatMap((node) => node.sourceStepIds))],
        riskScore: Math.max(...members.map((node) => node.riskScore)),
        data: {
          collapsedBlockId: block.id,
          nodeCount: members.length,
          status: block.status,
          nodes: members.map((node) => ({ id: node.id, title: node.title, status: node.status })),
        },
        recommendations: ['Déplier le bloc pour inspecter ses opérations.'],
      })
    )
  }

  const visibleSourceNodes = [...graph.nodes, ...summaryNodes]
  const nodes = visibleSourceNodes.filter((node) => retained.has(node.id))
  const visibleIds = new Set(nodes.map((node) => node.id))
  const edges = dedupeEdges(
    graph.edges
      .map((edge) => ({
        ...edge,
        id: `${replacement.get(edge.source) ?? edge.source}->${replacement.get(edge.target) ?? edge.target}:${edge.kind}`,
        source: replacement.get(edge.source) ?? edge.source,
        target: replacement.get(edge.target) ?? edge.target,
      }))
      .filter(
        (edge) =>
          edge.source !== edge.target && visibleIds.has(edge.source) && visibleIds.has(edge.target)
      )
  )

  // Reframe every block around what actually survived the projection, and drop the ones
  // a filter emptied out — an empty frame is a lie about the run.
  const positionsByBlock = new Map<string, ExecutionNodePosition[]>()
  for (const node of nodes) {
    const list = positionsByBlock.get(node.blockId)
    if (list) list.push(node.position)
    else positionsByBlock.set(node.blockId, [node.position])
  }
  const blocks = graph.blocks
    .map((block) => {
      const frame = executionBlockFrame(positionsByBlock.get(block.id) ?? [])
      return frame ? { ...block, ...frame } : undefined
    })
    .filter(isDefined)

  return {
    ...graph,
    id: `${graph.id}:projected:${filter}:${[...collapsedBlockIds].sort().join(',')}`,
    nodes,
    edges,
    blocks,
  }
}

export function graphNodeSearchText(node: ExecutionGraphNode): string {
  return [
    node.title,
    node.summary,
    node.description,
    node.tool,
    node.target,
    node.kind,
    node.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('fr')
}

function filterNodeIds(graph: ExecutionGraphSnapshot, filter: ExecutionGraphFilter): Set<string> {
  if (filter === 'all') return new Set(graph.nodes.map((node) => node.id))
  const kinds: Partial<Record<ExecutionGraphFilter, ExecutionNodeKind[]>> = {
    decisions: ['input', 'agent', 'decision', 'tool', 'policy', 'approval', 'checkpoint'],
    evidence: ['memory', 'observation', 'verifier', 'finding', 'report'],
  }
  if (filter === 'active') {
    const live = new Set(
      graph.nodes.filter((node) => LIVE_STATUSES.includes(node.status)).map((node) => node.id)
    )
    if (live.size === 0) {
      return new Set(
        graph.nodes
          .filter((node) => node.status === 'done')
          .slice(-4)
          .map((node) => node.id)
      )
    }
    // One hop around the live front. Expanding from a frozen seed set keeps the result
    // independent of edge order — growing the set while iterating would cascade further
    // for some edge orderings than others.
    const neighbourhood = new Set(live)
    for (const edge of graph.edges) {
      if (live.has(edge.source)) neighbourhood.add(edge.target)
      if (live.has(edge.target)) neighbourhood.add(edge.source)
    }
    return neighbourhood
  }
  const allowed = new Set(kinds[filter] ?? [])
  return new Set(graph.nodes.filter((node) => allowed.has(node.kind)).map((node) => node.id))
}

function groupCycles(steps: AgentRunStep[]): Cycle[] {
  const cycles: Cycle[] = []
  let current: Cycle | undefined
  steps.forEach((step, index) => {
    const indexed: IndexedStep = { step, index, id: stableStepId(step, index) }
    if (isReason(step)) {
      current = newCycle(cycles.length)
      current.reason = indexed
      cycles.push(current)
      return
    }
    if (isAction(step)) {
      if (!current || current.action || current.observation) {
        current = newCycle(cycles.length)
        cycles.push(current)
      }
      current.action = indexed
      return
    }
    if (isObservation(step)) {
      if (!current || current.observation) {
        current = newCycle(cycles.length)
        cycles.push(current)
      }
      current.observation = indexed
    }
  })
  return cycles
}

function newCycle(index: number): Cycle {
  return { id: `cycle:${index + 1}`, index }
}

function makeNode(
  node: Omit<ExecutionGraphNode, 'attempt' | 'riskLevel' | 'sourceStepIds' | 'recommendations'> & {
    sourceStepIds?: string[]
    recommendations?: string[]
  }
): ExecutionGraphNode {
  return {
    ...node,
    attempt: 1,
    riskLevel: riskLevel(node.riskScore),
    sourceStepIds: node.sourceStepIds ?? [],
    recommendations: node.recommendations ?? [],
  }
}

/** Assemble a block from its members: membership, status and frame all follow the nodes. */
function makeBlock(
  block: Omit<ExecutionGraphBlock, 'nodeIds' | 'status' | 'position' | 'width' | 'height'>,
  nodes: ExecutionGraphNode[]
): ExecutionGraphBlock {
  const frame = executionBlockFrame(nodes.map((node) => node.position)) ?? {
    position: { x: 0, y: 0 },
    width: 0,
    height: 0,
  }
  return {
    ...block,
    nodeIds: nodes.map((node) => node.id),
    status: blockStatus(nodes),
    ...frame,
  }
}

/** Size the world to the content it holds, so fit and the minimap stay honest. */
function worldSize(
  nodes: ExecutionGraphNode[],
  blocks: ExecutionGraphBlock[]
): { width: number; height: number } {
  let maxX = 0
  let maxY = 0
  for (const node of nodes) {
    maxX = Math.max(maxX, node.position.x + NODE_WIDTH)
    maxY = Math.max(maxY, node.position.y + NODE_HEIGHT)
  }
  for (const block of blocks) {
    maxX = Math.max(maxX, block.position.x + block.width)
    maxY = Math.max(maxY, block.position.y + block.height)
  }
  return {
    width: Math.ceil(maxX + EXECUTION_WORLD_MARGIN),
    height: Math.ceil(maxY + EXECUTION_WORLD_MARGIN),
  }
}

function port(
  id: string,
  label: string,
  direction: ExecutionPort['direction'],
  dataType: ExecutionPortDataType
): ExecutionPort {
  return { id, label, direction, dataType }
}

function addEdge(
  draft: GraphDraft,
  source: ExecutionGraphNode,
  target: ExecutionGraphNode,
  kind: ExecutionGraphEdge['kind'],
  label: string,
  sourcePort?: string,
  targetPort?: string,
  payloadPreview?: string,
  condition?: string
): void {
  draft.edges.push({
    id: `${source.id}->${target.id}:${kind}`,
    source: source.id,
    target: target.id,
    sourcePort,
    targetPort,
    kind,
    label,
    condition,
    payloadPreview: payloadPreview ? trim(payloadPreview, 120) : undefined,
    status: 'pending',
  })
}

function dedupeEdges(edges: ExecutionGraphEdge[]): ExecutionGraphEdge[] {
  const byKey = new Map<string, ExecutionGraphEdge>()
  for (const edge of edges) byKey.set(`${edge.source}|${edge.target}|${edge.kind}`, edge)
  return [...byKey.values()]
}

function edgeRuntimeStatus(
  edge: ExecutionGraphEdge,
  nodeById: ReadonlyMap<string, ExecutionGraphNode>
): ExecutionEdgeStatus {
  const source = nodeById.get(edge.source)
  const target = nodeById.get(edge.target)
  if (!source || !target) return 'pending'
  if (source.status === 'error' || target.status === 'error') return 'error'
  if (source.status === 'blocked' || target.status === 'blocked') return 'blocked'
  if (RUNNING_STATUSES.includes(source.status) || RUNNING_STATUSES.includes(target.status)) {
    return 'active'
  }
  if (source.status === 'done' && ['done', 'active', 'running'].includes(target.status))
    return 'traversed'
  return 'pending'
}

function blockStatus(nodes: ExecutionGraphNode[]): ExecutionNodeStatus {
  const precedence: ExecutionNodeStatus[] = [
    'error',
    'blocked',
    'awaiting_approval',
    'running',
    'active',
    'pending',
    'done',
    'skipped',
  ]
  return precedence.find((status) => nodes.some((node) => node.status === status)) ?? 'pending'
}

function runtimeStepStatus(
  indexed: IndexedStep,
  steps: AgentRunStep[],
  state: BuildExecutionGraphInput['state'],
  totalStepCount: number
): ExecutionNodeStatus {
  const isPlayhead = indexed.index === steps.length - 1
  const isHistoricalReplay = steps.length < totalStepCount
  if (isPlayhead && isHistoricalReplay) return 'active'
  if (isPlayhead && state === 'error') return 'error'
  if (isPlayhead && state === 'blocked') return 'blocked'
  if (isPlayhead && ['running', 'planning', 'starting'].includes(state)) return 'active'
  return 'done'
}

function toolIntentStatus(step: AgentRunStep): ExecutionNodeStatus {
  switch (step.toolCall?.status) {
    case 'requires_approval':
      return 'done'
    case 'rejected':
      return 'blocked'
    case 'error':
      return 'error'
    case 'running':
      return 'running'
    case 'done':
    case 'approved':
      return 'done'
    default:
      return 'active'
  }
}

function sandboxStatus(step: AgentRunStep, approval?: ApprovalRequestView): ExecutionNodeStatus {
  if (approval?.status === 'rejected' || approval?.status === 'expired') return 'blocked'
  if (approval?.status === 'pending' || step.toolCall?.status === 'requires_approval')
    return 'pending'
  switch (step.toolCall?.status) {
    case 'running':
      return 'running'
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    case 'rejected':
      return 'blocked'
    case 'approved':
      return 'active'
    default:
      return 'pending'
  }
}

function approvalStatus(approval?: ApprovalRequestView): ExecutionNodeStatus {
  switch (approval?.status) {
    case 'approved':
      return 'done'
    case 'rejected':
    case 'expired':
      return 'blocked'
    case 'pending':
    default:
      return 'awaiting_approval'
  }
}

function reportStatus(
  state: BuildExecutionGraphInput['state'],
  visible: number,
  total: number
): ExecutionNodeStatus {
  if (visible < total) return 'pending'
  if (state === 'done') return 'done'
  if (state === 'error') return 'error'
  if (state === 'blocked') return 'blocked'
  return 'pending'
}

function agentStatus(state: BuildExecutionGraphInput['state']): ExecutionNodeStatus {
  if (state === 'error') return 'error'
  if (state === 'blocked') return 'blocked'
  if (state === 'done') return 'done'
  if (state === 'awaiting_approval') return 'awaiting_approval'
  if (['running', 'planning', 'starting'].includes(state)) return 'running'
  return 'pending'
}

function reportSummary(
  state: BuildExecutionGraphInput['state'],
  visible: number,
  total: number
): string {
  if (visible < total) return `relecture ${visible}/${total}`
  if (state === 'done') return 'rapport prêt'
  if (state === 'error') return 'run en erreur'
  if (state === 'blocked') return 'run bloqué'
  return 'en attente de fin'
}

function sandboxSummary(step: AgentRunStep): string {
  switch (step.toolCall?.status) {
    case 'running':
      return 'exécution en cours'
    case 'done':
      return 'exécution terminée'
    case 'error':
      return 'échec d’exécution'
    case 'requires_approval':
      return 'verrouillée par approbation'
    case 'rejected':
      return 'exécution refusée'
    default:
      return 'en file sécurisée'
  }
}

function approvalSummary(approval?: ApprovalRequestView): string {
  if (!approval) return 'décision requise'
  if (approval.status === 'pending')
    return approval.expiresAt ? `expire ${formatShortTime(approval.expiresAt)}` : 'décision requise'
  if (approval.status === 'approved') return 'action approuvée'
  if (approval.status === 'rejected') return 'action rejetée'
  return 'demande expirée'
}

function approvalEdgeLabel(approval?: ApprovalRequestView): string {
  if (!approval || approval.status === 'pending') return 'en attente'
  if (approval.status === 'approved') return 'autorisé par humain'
  return approval.status === 'rejected' ? 'refusé' : 'expiré'
}

function findApproval(
  step: AgentRunStep,
  approvals: ApprovalRequestView[],
  used: Set<string>,
  runId?: string
): ApprovalRequestView | undefined {
  const exact = approvals.find(
    (item) => !used.has(item.id) && item.toolCallId && item.toolCallId === step.toolCall?.id
  )
  const fallback =
    step.toolCall?.status === 'requires_approval'
      ? approvals.find(
          (item) =>
            !used.has(item.id) &&
            !item.toolCallId &&
            (!runId || !item.runId || item.runId === runId)
        )
      : undefined
  const match = exact ?? fallback
  if (match) used.add(match.id)
  return match
}

function graphRiskScore(
  approvals: ApprovalRequestView[],
  steps: AgentRunStep[],
  demo: boolean
): number {
  const approvalRisk = approvals.reduce(
    (max, approval) => Math.max(max, riskFromApproval(approval) ?? 0),
    0
  )
  const actionRisk = steps
    .filter(isAction)
    .reduce((max, step) => Math.max(max, actionRiskScore(step, approvals, demo)), 0)
  return Math.max(demo ? 62 : 18, approvalRisk, actionRisk)
}

function actionRiskScore(
  step: AgentRunStep,
  approvals: ApprovalRequestView[],
  demo: boolean
): number {
  const approval = approvals.find((item) => item.toolCallId === step.toolCall?.id)
  if (approval) return riskFromApproval(approval) ?? 50
  if (step.toolCall?.status === 'requires_approval') return 64
  if (step.toolCall?.status === 'error' || step.toolCall?.status === 'rejected') return 70
  const name = step.toolCall?.name.toLowerCase() ?? ''
  if (/nmap|gobuster|scan|shell/.test(name)) return 42
  return demo ? 56 : 24
}

function observationRisk(step: AgentRunStep): number {
  const text = `${step.content} ${step.observation ?? ''}`.toLowerCase()
  if (/critical|rce|remote code execution/.test(text)) return 88
  if (/high|vulnerab|cve-\d{4}-\d+/.test(text)) return 70
  if (/open|exposed|warning/.test(text)) return 46
  return 18
}

function riskFromApproval(approval?: ApprovalRequestView): number | undefined {
  if (!approval?.risk) return undefined
  return { low: 20, medium: 48, high: 74, critical: 92 }[approval.risk]
}

function riskLevel(score: number): ExecutionRiskLevel {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

function riskSummary(score: number): string {
  const level = riskLevel(score)
  if (level === 'critical') return 'revue critique requise'
  if (level === 'high') return 'constat prioritaire'
  if (level === 'medium') return 'revue recommandée'
  return 'aucun risque majeur confirmé'
}

function stepData(step: AgentRunStep): Record<string, unknown> {
  return {
    id: step.id ?? null,
    runId: step.runId ?? null,
    type: step.type,
    content: step.content,
    observation: step.observation ?? null,
    toolCall: step.toolCall ?? null,
    metadata: step.metadata ?? null,
    timestamp: step.timestamp,
  }
}

function stableStepId(step: AgentRunStep, index: number): string {
  return step.id ?? `${step.runId ?? 'run'}:${index}:${step.type}:${step.timestamp}`
}

function inferTarget(step: AgentRunStep): string | undefined {
  if (!step.toolCall) return undefined
  const args = step.toolCall.args
  const candidate = args['target'] ?? args['url'] ?? args['host'] ?? args['path'] ?? args['command']
  return typeof candidate === 'string' ? candidate : undefined
}

function runDuration(steps: AgentRunStep[]): number | undefined {
  if (steps.length < 2) return steps[0]?.metadata?.durationMs
  const first = steps[0]?.timestamp
  const last = steps.at(-1)?.timestamp
  return first && last ? Math.max(0, last - first) : undefined
}

function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

function formatShortTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function trim(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(1, max - 1))}…`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function statusLabel(status: ExecutionNodeStatus): string {
  return {
    pending: 'en attente',
    active: 'actif',
    running: 'en cours',
    awaiting_approval: 'approbation',
    blocked: 'bloqué',
    error: 'erreur',
    done: 'terminé',
    skipped: 'ignoré',
  }[status]
}

function isReason(step: AgentRunStep): boolean {
  return step.type === 'reason' || step.type === 'thought'
}

function isAction(step: AgentRunStep): boolean {
  return step.type === 'act' || step.type === 'action'
}

function isObservation(step: AgentRunStep): boolean {
  return step.type === 'observe' || step.type === 'observation'
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
