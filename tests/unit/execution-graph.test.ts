import { describe, expect, it } from 'vitest'
import type { AgentRunStep } from '../../src/shared/types/agent.types'
import type { ApprovalRequestView } from '../../src/shared/types/approval.types'
import type {
  ExecutionGraphBlock,
  ExecutionGraphNode,
  ExecutionGraphSnapshot,
} from '../../src/shared/types/execution-graph.types'
import type { ExecutionBlockFrame } from '../../src/renderer/src/lib/execution-graph'
import {
  EXECUTION_BLOCK_PADDING,
  EXECUTION_NODE_HEIGHT,
  EXECUTION_NODE_WIDTH,
  buildExecutionGraph,
  projectExecutionGraph,
} from '../../src/renderer/src/lib/execution-graph'

const NOW = Date.parse('2026-07-16T12:00:00.000Z')

function step(
  id: string,
  type: AgentRunStep['type'],
  content: string,
  offset: number,
  toolCall?: AgentRunStep['toolCall']
): AgentRunStep {
  return {
    id,
    runId: 'run-1',
    type,
    content,
    toolCall,
    metadata: { tokensUsed: 12, durationMs: 80, confidenceScore: 0.82 },
    timestamp: NOW + offset,
  }
}

function build(
  steps: AgentRunStep[],
  approvals: ApprovalRequestView[] = [],
  totalStepCount = steps.length
) {
  return buildExecutionGraph({
    prompt: 'Inspecter la posture locale sans action destructive.',
    currentRunId: 'run-1',
    state: approvals.some((item) => item.status === 'pending') ? 'awaiting_approval' : 'running',
    steps,
    totalStepCount,
    error: null,
    modelStatus: null,
    pendingApprovals: approvals.filter((item) => item.status === 'pending'),
    recentApprovals: approvals.filter((item) => item.status !== 'pending'),
  })
}

function contains(block: ExecutionGraphBlock, node: ExecutionGraphNode): boolean {
  return (
    node.position.x >= block.position.x &&
    node.position.y >= block.position.y &&
    node.position.x + EXECUTION_NODE_WIDTH <= block.position.x + block.width &&
    node.position.y + EXECUTION_NODE_HEIGHT <= block.position.y + block.height
  )
}

function blockOf(graph: ExecutionGraphSnapshot, id: string): ExecutionGraphBlock {
  const block = graph.blocks.find((item) => item.id === id)
  if (!block) throw new Error(`missing block ${id}`)
  return block
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function rect(block: ExecutionGraphBlock): Rect {
  return { x: block.position.x, y: block.position.y, width: block.width, height: block.height }
}

function nodeRect(node: ExecutionGraphNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: EXECUTION_NODE_WIDTH,
    height: EXECUTION_NODE_HEIGHT,
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function pairs<T>(items: T[]): [T, T][] {
  const result: [T, T][] = []
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) result.push([items[i]!, items[j]!])
  }
  return result
}

/** The frame a block must have to hug exactly these nodes. */
function expectedFrame(nodes: ExecutionGraphNode[]): ExecutionBlockFrame {
  const xs = nodes.map((node) => node.position.x)
  const ys = nodes.map((node) => node.position.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs) + EXECUTION_NODE_WIDTH
  const maxY = Math.max(...ys) + EXECUTION_NODE_HEIGHT
  return {
    position: {
      x: minX - EXECUTION_BLOCK_PADDING.left,
      y: minY - EXECUTION_BLOCK_PADDING.top,
    },
    width: maxX - minX + EXECUTION_BLOCK_PADDING.left + EXECUTION_BLOCK_PADDING.right,
    height: maxY - minY + EXECUTION_BLOCK_PADDING.top + EXECUTION_BLOCK_PADDING.bottom,
  }
}

describe('execution graph adapter', () => {
  it('creates distinct runtime instances and reusable blocks for every ReAct cycle', () => {
    const graph = build([
      step('r1', 'reason', 'Inspecter les interfaces.', 0),
      step('a1', 'act', 'Lister les interfaces locales.', 100, {
        id: 'tool-1',
        name: 'shell',
        args: { command: 'ipconfig' },
        status: 'done',
      }),
      step('o1', 'observe', 'Interface Ethernet: 127.0.0.1', 200),
      step('r2', 'reason', 'Vérifier ensuite les sockets.', 300),
      step('a2', 'act', 'Lister les ports en écoute.', 400, {
        id: 'tool-2',
        name: 'network',
        args: { target: '127.0.0.1' },
        status: 'running',
      }),
    ])

    expect(graph.blocks.map((block) => block.id)).toEqual([
      'mission',
      'cycle:1',
      'cycle:2',
      'analysis',
    ])
    expect(graph.blocks.find((block) => block.id === 'cycle:1')).toMatchObject({
      definitionId: 'nexus.react-cycle',
      version: 1,
    })
    expect(graph.nodes.filter((node) => node.kind === 'decision')).toHaveLength(2)
    expect(graph.nodes.filter((node) => node.kind === 'tool')).toHaveLength(2)
    expect(graph.nodes.find((node) => node.id === 'cycle:1:checkpoint')?.data).toMatchObject({
      visualReplayOnly: true,
      stepIndex: 3,
    })
    expect(
      graph.edges.some((edge) => edge.kind === 'context' && edge.target === 'mission:memory')
    ).toBe(true)
    expect(
      graph.edges.some((edge) => edge.kind === 'evidence' && edge.target === 'analysis:verifier')
    ).toBe(true)
  })

  it('renders approval as an explicit gate before the sandbox', () => {
    const approval: ApprovalRequestView = {
      id: 'approval-1',
      runId: 'run-1',
      toolCallId: 'tool-1',
      intentKind: 'network',
      summary: 'Scan de 127.0.0.1',
      reason: 'Le scan actif nécessite une validation humaine.',
      risk: 'high',
      status: 'pending',
      createdAt: '2026-07-16T12:00:00.000Z',
      expiresAt: '2026-07-16T12:05:00.000Z',
    }
    const graph = build(
      [
        step('r1', 'reason', 'Préparer un scan ciblé.', 0),
        step('a1', 'act', 'Scanner la cible locale.', 100, {
          id: 'tool-1',
          name: 'nmap',
          args: { target: '127.0.0.1' },
          status: 'requires_approval',
        }),
      ],
      [approval]
    )

    const gate = graph.nodes.find((node) => node.id === 'cycle:1:approval')
    const sandbox = graph.nodes.find((node) => node.id === 'cycle:1:sandbox')
    expect(gate).toMatchObject({
      status: 'awaiting_approval',
      riskLevel: 'high',
      target: 'Scan de 127.0.0.1',
    })
    expect(sandbox?.status).toBe('pending')
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: 'cycle:1:policy',
        target: 'cycle:1:approval',
        kind: 'condition',
        condition: 'risk >= policy threshold',
      })
    )
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: 'cycle:1:approval',
        target: 'cycle:1:sandbox',
        status: 'active',
      })
    )
  })

  it('keeps replay snapshots honest by marking the playhead and withholding the report', () => {
    const allSteps = [
      step('r1', 'reason', 'Décider.', 0),
      step('a1', 'act', 'Agir.', 100, { id: 'tool-1', name: 'shell', args: {}, status: 'done' }),
      step('o1', 'observe', 'Résultat réel.', 200),
    ]
    const graph = build(allSteps.slice(0, 1), [], allSteps.length)

    expect(graph.visibleStepCount).toBe(1)
    expect(graph.totalStepCount).toBe(3)
    expect(graph.nodes.find((node) => node.id === 'cycle:1:decision')?.status).toBe('active')
    expect(graph.nodes.find((node) => node.id === 'analysis:report')?.status).toBe('pending')
    expect(graph.nodes.some((node) => node.kind === 'observation')).toBe(false)
  })

  it('projects focus filters and collapsed blocks without mutating the source graph', () => {
    const source = build([
      step('r1', 'reason', 'Décider.', 0),
      step('a1', 'act', 'Agir.', 100, { id: 'tool-1', name: 'shell', args: {}, status: 'done' }),
      step('o1', 'observe', 'Preuve observée.', 200),
    ])
    const collapsed = projectExecutionGraph(source, 'all', new Set(['cycle:1']))
    const evidence = projectExecutionGraph(source, 'evidence', new Set())

    expect(collapsed.nodes.some((node) => node.id === 'block-summary:cycle:1')).toBe(true)
    expect(
      collapsed.nodes.find((node) => node.id === 'block-summary:cycle:1')?.sourceStepIds
    ).toEqual(['r1', 'a1', 'o1'])
    expect(collapsed.nodes.some((node) => node.id === 'cycle:1:tool')).toBe(false)
    expect(collapsed.edges.every((edge) => edge.source !== edge.target)).toBe(true)
    expect(source.nodes.some((node) => node.id === 'cycle:1:tool')).toBe(true)
    expect(
      evidence.nodes.every((node) =>
        ['memory', 'observation', 'verifier', 'finding', 'report'].includes(node.kind)
      )
    ).toBe(true)
  })

  it('graphs an observation that arrives without a tool call', () => {
    const graph = build([
      step('r1', 'reason', 'Relire la configuration déjà collectée.', 0),
      step('o1', 'observe', 'Le pare-feu local est actif.', 100),
    ])

    const observation = graph.nodes.find((node) => node.id === 'cycle:1:observation')
    expect(observation).toMatchObject({ kind: 'observation', sourceStepIds: ['o1'] })
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: 'cycle:1:decision', target: 'cycle:1:observation' })
    )
    // The evidence guard must see the observation, not report a run with no proof.
    expect(graph.nodes.find((node) => node.id === 'analysis:verifier')).toMatchObject({
      status: 'done',
      data: { grounded: true },
    })
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: 'cycle:1:observation', target: 'analysis:verifier' })
    )
  })

  it('derives every block frame from the nodes it holds', () => {
    const graph = build([
      step('r1', 'reason', 'Préparer un scan.', 0),
      step('a1', 'act', 'Scanner.', 100, {
        id: 'tool-1',
        name: 'nmap',
        args: { target: '127.0.0.1' },
        status: 'requires_approval',
      }),
      step('o1', 'observe', 'Port 443 ouvert.', 200),
    ])

    for (const block of graph.blocks) {
      const members = block.nodeIds.map((id) => {
        const node = graph.nodes.find((item) => item.id === id)
        if (!node) throw new Error(`missing node ${id}`)
        return node
      })
      expect(members.length).toBeGreaterThan(0)
      for (const node of members) {
        expect({ block: block.id, node: node.id, contained: contains(block, node) }).toEqual({
          block: block.id,
          node: node.id,
          contained: true,
        })
      }
    }
    // And the world contains every block.
    for (const block of graph.blocks) {
      expect(block.position.x + block.width).toBeLessThanOrEqual(graph.world.width)
      expect(block.position.y + block.height).toBeLessThanOrEqual(graph.world.height)
    }
  })

  it('lays out a multi-cycle run without overlapping blocks or nodes', () => {
    const steps: AgentRunStep[] = []
    for (let cycle = 0; cycle < 4; cycle += 1) {
      steps.push(step(`r${cycle}`, 'reason', `Décider ${cycle}.`, cycle * 1000))
      steps.push(
        step(`a${cycle}`, 'act', `Agir ${cycle}.`, cycle * 1000 + 100, {
          id: `tool-${cycle}`,
          name: 'nmap',
          args: { target: '127.0.0.1' },
          // Alternate the approval gate: it shifts the sandbox column.
          status: cycle % 2 === 0 ? 'requires_approval' : 'done',
        })
      )
      steps.push(step(`o${cycle}`, 'observe', `Preuve ${cycle}.`, cycle * 1000 + 200))
    }
    const graph = build(steps)

    expect(graph.blocks).toHaveLength(6)
    for (const [a, b] of pairs(graph.blocks)) {
      expect({ pair: `${a.id}/${b.id}`, overlap: overlaps(rect(a), rect(b)) }).toEqual({
        pair: `${a.id}/${b.id}`,
        overlap: false,
      })
    }
    for (const [a, b] of pairs(graph.nodes)) {
      expect({ pair: `${a.id}/${b.id}`, overlap: overlaps(nodeRect(a), nodeRect(b)) }).toEqual({
        pair: `${a.id}/${b.id}`,
        overlap: false,
      })
    }
  })

  it('drops blocks a filter emptied and reframes the ones that survive', () => {
    const source = build([
      step('r1', 'reason', 'Décider.', 0),
      step('a1', 'act', 'Agir.', 100, { id: 'tool-1', name: 'shell', args: {}, status: 'done' }),
      step('o1', 'observe', 'Preuve observée.', 200),
    ])
    const decisions = projectExecutionGraph(source, 'decisions', new Set())

    // "Preuves & synthèse" holds only evidence nodes, so its frame must not survive.
    expect(source.blocks.some((block) => block.id === 'analysis')).toBe(true)
    expect(decisions.blocks.some((block) => block.id === 'analysis')).toBe(false)
    expect(
      decisions.blocks.every((block) => decisions.nodes.some((n) => n.blockId === block.id))
    ).toBe(true)

    // Every surviving frame hugs exactly the nodes still on screen.
    for (const block of decisions.blocks) {
      const visible = decisions.nodes.filter((node) => node.blockId === block.id)
      expect({ id: block.id, ...expectedFrame(visible) }).toEqual({
        id: block.id,
        position: block.position,
        width: block.width,
        height: block.height,
      })
    }
    // The mission frame shrinks: its memory node is evidence and is filtered out.
    expect(blockOf(decisions, 'mission').height).toBeLessThan(blockOf(source, 'mission').height)
  })

  it('folds a collapsed block around its summary node', () => {
    const source = build([
      step('r1', 'reason', 'Décider.', 0),
      step('a1', 'act', 'Agir.', 100, { id: 'tool-1', name: 'shell', args: {}, status: 'done' }),
    ])
    const collapsed = projectExecutionGraph(source, 'all', new Set(['cycle:1']))
    const summary = collapsed.nodes.find((node) => node.id === 'block-summary:cycle:1')
    const block = blockOf(collapsed, 'cycle:1')

    expect(summary).toBeDefined()
    if (!summary) throw new Error('missing summary')
    expect(contains(block, summary)).toBe(true)
    expect(block.width).toBeLessThan(blockOf(source, 'cycle:1').width)
    // The fold stays put rather than jumping: the summary sits where the block was centred.
    const sourceBlock = blockOf(source, 'cycle:1')
    expect(summary.position.x + EXECUTION_NODE_WIDTH / 2).toBeCloseTo(
      sourceBlock.position.x + sourceBlock.width / 2,
      0
    )
  })

  it('scopes the active filter to a one-hop neighbourhood of the live front', () => {
    const source = build(
      [
        step('r1', 'reason', 'Décider.', 0),
        step('a1', 'act', 'Agir.', 100, { id: 'tool-1', name: 'shell', args: {}, status: 'done' }),
        step('o1', 'observe', 'Preuve.', 200),
        step('r2', 'reason', 'Poursuivre.', 300),
        step('a2', 'act', 'Agir encore.', 400, {
          id: 'tool-2',
          name: 'shell',
          args: {},
          status: 'running',
        }),
      ],
      []
    )
    const active = projectExecutionGraph(source, 'active', new Set())
    const live = source.nodes.filter((node) =>
      ['active', 'running', 'awaiting_approval', 'blocked', 'error'].includes(node.status)
    )
    const liveIds = new Set(live.map((node) => node.id))
    const allowed = new Set(liveIds)
    for (const edge of source.edges) {
      if (liveIds.has(edge.source)) allowed.add(edge.target)
      if (liveIds.has(edge.target)) allowed.add(edge.source)
    }

    expect(live.length).toBeGreaterThan(0)
    // Nothing further than one hop leaks in, whatever order the edges were built in.
    expect(active.nodes.every((node) => allowed.has(node.id))).toBe(true)
    expect(active.nodes.length).toBeLessThan(source.nodes.length)
    for (const node of live) expect(active.nodes.some((item) => item.id === node.id)).toBe(true)
  })
})
