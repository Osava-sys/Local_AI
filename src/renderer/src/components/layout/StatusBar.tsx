import type { AgentState } from '@shared/types/agent.types'

interface StatusBarProps {
  agentState: AgentState | 'starting'
  currentRunId: string | null
  lastMessage?: string | null
}

export function StatusBar({
  agentState,
  currentRunId,
  lastMessage,
}: StatusBarProps): React.ReactElement {
  return (
    <footer className="status-bar">
      <span className="status-bar__run">
        <i data-state={agentState} />
        Agent <strong>{formatAgentState(agentState)}</strong>
        {currentRunId && (
          <>
            {' '}
            · Run <strong className="mono">{currentRunId.slice(0, 16)}</strong>
          </>
        )}
      </span>
      <span className="truncate status-bar__message">
        {lastMessage ?? 'NEXUS prêt pour une mission locale'}
      </span>
      <span className="status-bar__trust">Traitement local · garde-fous actifs</span>
    </footer>
  )
}

function formatAgentState(state: AgentState | 'starting'): string {
  const labels: Record<AgentState | 'starting', string> = {
    idle: 'inactif',
    starting: 'démarrage',
    planning: 'planification',
    awaiting_approval: 'approbation',
    running: 'en cours',
    blocked: 'bloqué',
    done: 'terminé',
    error: 'erreur',
    paused: 'en pause',
  }
  return labels[state]
}
