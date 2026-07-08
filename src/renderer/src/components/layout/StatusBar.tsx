import type { AgentState } from '@shared/types/agent.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'

interface StatusBarProps {
  agentState: AgentState | 'starting'
  currentRunId: string | null
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: number
  lastMessage?: string | null
}

export function StatusBar({
  agentState,
  currentRunId,
  modelStatus,
  pendingApprovals,
  lastMessage,
}: StatusBarProps): React.ReactElement {
  return (
    <footer className="status-bar">
      <span>
        Agent <strong>{agentState}</strong>
        {currentRunId && (
          <>
            {' '}
            · Run <strong>{currentRunId}</strong>
          </>
        )}
      </span>
      <span className="truncate">{lastMessage ?? modelStatus?.endpoint ?? 'Nexus renderer ready'}</span>
      <span>
        Model <strong>{modelStatus?.modelName ?? modelStatus?.state ?? 'idle'}</strong> · Approvals{' '}
        <strong>{pendingApprovals}</strong>
      </span>
    </footer>
  )
}
