import { Menu, Moon, Play, Plus, Settings, Square, Sun } from 'lucide-react'
import type { AgentState } from '@shared/types/agent.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import { appRouteSections, getAppRoute, type AppRouteId } from '../../routes'
import { Button } from '../ui/Button'
import { Switch } from '../ui/Switch'
import { Tooltip } from '../ui/Tooltip'
import { NotificationCenter } from './NotificationCenter'

type AgentUiState = AgentState | 'starting'
type ThemeMode = 'light' | 'dark'

interface HeaderProps {
  activeRoute: AppRouteId
  agentState: AgentUiState
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: number
  sandboxActive: boolean
  lastMessage?: string | null
  theme: ThemeMode
  canStop: boolean
  onNavigate(route: AppRouteId): void
  onOpenSidebar(): void
  onStart(): void
  onStop(): void
  onNewRun(): void
  onSettings(): void
  onToggleTheme(theme: ThemeMode): void
}

export function Header({
  activeRoute,
  agentState,
  modelStatus,
  pendingApprovals,
  sandboxActive,
  lastMessage,
  theme,
  canStop,
  onNavigate,
  onOpenSidebar,
  onStart,
  onStop,
  onNewRun,
  onSettings,
  onToggleTheme,
}: HeaderProps): React.ReactElement {
  const route = getAppRoute(activeRoute)
  const section = appRouteSections.find((item) => item.id === route.section)?.label ?? 'NEXUS'

  return (
    <header className="app-header">
      <button
        aria-label="Ouvrir la navigation"
        className="header-mobile-menu"
        type="button"
        onClick={onOpenSidebar}
      >
        <Menu size={19} />
      </button>

      <div className="header-context">
        <span>{section}</span>
        <div>
          <strong>{route.label}</strong>
          <small>{route.description}</small>
        </div>
      </div>

      <div className="header-notifications">
        <NotificationCenter
          agentState={agentState}
          lastMessage={lastMessage}
          modelStatus={modelStatus}
          pendingApprovals={pendingApprovals}
          sandboxActive={sandboxActive}
          onNavigate={onNavigate}
        />
      </div>

      <div className="header-actions">
        <Button
          aria-label="Démarrer l’agent"
          className="header-action header-action--start"
          variant="primary"
          onClick={onStart}
        >
          <Play size={16} />
          <span>Démarrer</span>
        </Button>
        <Button
          aria-label="Arrêter l’agent"
          className="header-action header-action--stop"
          disabled={!canStop}
          variant="subtle"
          onClick={onStop}
        >
          <Square size={15} />
          <span>Arrêter</span>
        </Button>
        <Button
          aria-label="Créer une nouvelle exécution"
          className="header-action header-action--new"
          variant="subtle"
          onClick={onNewRun}
        >
          <Plus size={16} />
          <span>Nouvelle exécution</span>
        </Button>
        <Tooltip label="Paramètres">
          <Button aria-label="Paramètres" iconOnly variant="ghost" onClick={onSettings}>
            <Settings size={17} />
          </Button>
        </Tooltip>
        <Switch
          checked={theme === 'dark'}
          label={theme === 'dark' ? <MoonLabel /> : <SunLabel />}
          onCheckedChange={(checked) => onToggleTheme(checked ? 'dark' : 'light')}
        />
      </div>
    </header>
  )
}

function MoonLabel(): React.ReactElement {
  return (
    <span className="header-cluster">
      <Moon size={14} />
      <span>Dark</span>
    </span>
  )
}

function SunLabel(): React.ReactElement {
  return (
    <span className="header-cluster">
      <Sun size={14} />
      <span>Light</span>
    </span>
  )
}
