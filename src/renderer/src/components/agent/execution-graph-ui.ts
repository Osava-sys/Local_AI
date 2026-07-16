import {
  AlertTriangle,
  Bot,
  BrainCog,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Code2,
  FileText,
  FlaskConical,
  MemoryStick,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ExecutionGraphNode, ExecutionNodeKind } from '@shared/types/execution-graph.types'

export function executionNodeIcon(kind: ExecutionNodeKind): LucideIcon {
  return (
    {
      input: MessageSquareText,
      agent: Bot,
      decision: Sparkles,
      memory: MemoryStick,
      tool: Code2,
      policy: ShieldCheck,
      approval: ClipboardCheck,
      sandbox: Terminal,
      observation: FlaskConical,
      verifier: CheckCircle2,
      finding: AlertTriangle,
      checkpoint: CircleDot,
      report: FileText,
    }[kind] ?? BrainCog
  )
}

export function executionNodeKindLabel(kind: ExecutionNodeKind): string {
  return {
    input: 'entrée',
    agent: 'agent',
    decision: 'décision',
    memory: 'mémoire',
    tool: 'outil',
    policy: 'politique',
    approval: 'approbation',
    sandbox: 'sandbox',
    observation: 'observation',
    verifier: 'vérificateur',
    finding: 'constat',
    checkpoint: 'checkpoint',
    report: 'rapport',
  }[kind]
}

export function executionStatusLabel(status: ExecutionGraphNode['status']): string {
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
