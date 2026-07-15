import { Moon, Play, Plus, Settings, Square, Sun } from 'lucide-react'
import type { AgentState } from '@shared/types/agent.types'
import nexusLogo from '../../assets/nexus-logo.png'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Switch } from '../ui/Switch'
import { Tooltip } from '../ui/Tooltip'

type AgentUiState = AgentState | 'starting'
type ThemeMode = 'light' | 'dark'

interface HeaderProps {
  agentState: AgentUiState
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: number
  sandboxActive: boolean
  theme: ThemeMode
  canStop: boolean
  onStart(): void
  onStop(): void
  onNewRun(): void
  onSettings(): void
  onToggleTheme(theme: ThemeMode): void
}

const AGENT_LABEL: Record<AgentUiState, string> = {
  idle: 'Inactif',
  planning: 'Planification',
  starting: 'Démarrage',
  awaiting_approval: 'En attente',
  running: 'En cours',
  blocked: 'Bloqué',
  done: 'Terminé',
  error: 'Erreur',
  paused: 'En pause',
}

export function Header({
  agentState,
  modelStatus,
  pendingApprovals,
  sandboxActive,
  theme,
  canStop,
  onStart,
  onStop,
  onNewRun,
  onSettings,
  onToggleTheme,
}: HeaderProps): React.ReactElement {
  const modelBadge = getModelBadge(modelStatus)
  const agentBadge = getAgentBadge(agentState)

  return (
    <header className="app-header">
      <div className="header-brand">
        <span className="app-logo" role="img" aria-label="NEXUS">
          <img src={nexusLogo} alt="" />
        </span>
        <div className="brand-title">
          <strong>NEXUS</strong>
          <span>Console de cyberdéfense</span>
        </div>
      </div>

      <div className="header-status">
        <Badge tone={modelBadge.tone}>{modelBadge.label}</Badge>
        <Badge tone={agentBadge.tone}>{agentBadge.label}</Badge>
        <Badge tone={pendingApprovals > 0 ? 'warning' : 'success'}>
          {pendingApprovals > 0 ? `${pendingApprovals} approbation${pendingApprovals > 1 ? 's' : ''}` : 'Approbations à jour'}
        </Badge>
        <Badge tone={sandboxActive ? 'success' : 'warning'}>
          {sandboxActive ? 'Sandbox active' : 'Sandbox inactive'}
        </Badge>
      </div>

      <div className="header-actions">
        <Button variant="primary" onClick={onStart}>
          <Play size={16} />
          Démarrer
        </Button>
        <Button disabled={!canStop} variant="subtle" onClick={onStop}>
          <Square size={15} />
          Arrêter
        </Button>
        <Button variant="subtle" onClick={onNewRun}>
          <Plus size={16} />
          Nouvelle exécution
        </Button>
        <Tooltip label="Paramètres">
          <Button aria-label="Settings" iconOnly variant="ghost" onClick={onSettings}>
            <Settings size={17} />
          </Button>
        </Tooltip>
        <Switch
          checked={theme === 'dark'}
          label={theme === 'dark' ? <MoonLabel /> : <SunLabel />}
          onCheckedChange={checked => onToggleTheme(checked ? 'dark' : 'light')}
        />
      </div>
    </header>
  )
}

function MoonLabel(): React.ReactElement {
  return (
    <span className="header-cluster">
      <Moon size={14} />
      Dark
    </span>
  )
}

function SunLabel(): React.ReactElement {
  return (
    <span className="header-cluster">
      <Sun size={14} />
      Light
    </span>
  )
}

function getModelBadge(status: ModelRuntimeStatus | null): { label: string; tone: BadgeTone } {
  if (status?.state === 'running') return { label: 'Modèle chargé', tone: 'success' }
  if (status?.state === 'starting') return { label: 'Chargement…', tone: 'warning' }
  if (status?.state === 'error') return { label: 'Erreur modèle', tone: 'danger' }
  return { label: 'Modèle inactif', tone: 'neutral' }
}

function getAgentBadge(state: AgentUiState): { label: string; tone: BadgeTone } {
  if (state === 'awaiting_approval') return { label: AGENT_LABEL[state], tone: 'warning' }
  if (state === 'running' || state === 'planning' || state === 'starting') {
    return { label: AGENT_LABEL[state], tone: 'accent' }
  }
  if (state === 'done') return { label: AGENT_LABEL[state], tone: 'success' }
  if (state === 'blocked' || state === 'error') return { label: AGENT_LABEL[state], tone: 'danger' }
  return { label: AGENT_LABEL[state], tone: 'neutral' }
}
