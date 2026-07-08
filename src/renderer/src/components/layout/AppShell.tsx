import type { ReactNode } from 'react'
import type { AgentState } from '@shared/types/agent.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import type { AppRouteId } from '../../routes'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'

type ThemeMode = 'light' | 'dark'

interface AppShellProps {
  activeRoute: AppRouteId
  children: ReactNode
  agentState: AgentState | 'starting'
  currentRunId: string | null
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: number
  sandboxActive: boolean
  theme: ThemeMode
  canStop: boolean
  lastMessage?: string | null
  onRouteChange(route: AppRouteId): void
  onStart(): void
  onStop(): void
  onNewRun(): void
  onSettings(): void
  onToggleTheme(theme: ThemeMode): void
}

export function AppShell({
  activeRoute,
  children,
  agentState,
  currentRunId,
  modelStatus,
  pendingApprovals,
  sandboxActive,
  theme,
  canStop,
  lastMessage,
  onRouteChange,
  onStart,
  onStop,
  onNewRun,
  onSettings,
  onToggleTheme,
}: AppShellProps): React.ReactElement {
  return (
    <div className="app-shell">
      <Sidebar activeRoute={activeRoute} onRouteChange={onRouteChange} />
      <Header
        agentState={agentState}
        canStop={canStop}
        modelStatus={modelStatus}
        pendingApprovals={pendingApprovals}
        sandboxActive={sandboxActive}
        theme={theme}
        onNewRun={onNewRun}
        onSettings={onSettings}
        onStart={onStart}
        onStop={onStop}
        onToggleTheme={onToggleTheme}
      />
      <main className="app-main">{children}</main>
      <StatusBar
        agentState={agentState}
        currentRunId={currentRunId}
        lastMessage={lastMessage}
        modelStatus={modelStatus}
        pendingApprovals={pendingApprovals}
      />
    </div>
  )
}
