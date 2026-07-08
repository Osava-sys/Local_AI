import {
  BarChart3,
  Bot,
  ClipboardCheck,
  FileWarning,
  History,
  Package,
  Settings,
  Shield,
} from 'lucide-react'
import { appRoutes, type AppRouteId } from '../../routes'
import { Tooltip } from '../ui/Tooltip'

interface SidebarProps {
  activeRoute: AppRouteId
  onRouteChange(route: AppRouteId): void
}

const ICONS: Record<AppRouteId, React.ReactElement> = {
  dashboard: <BarChart3 size={19} />,
  'agent-runs': <Bot size={20} />,
  approvals: <ClipboardCheck size={19} />,
  models: <Package size={19} />,
  sandbox: <Shield size={19} />,
  'audit-log': <History size={19} />,
  'risk-reports': <FileWarning size={19} />,
  settings: <Settings size={19} />,
}

export function Sidebar({ activeRoute, onRouteChange }: SidebarProps): React.ReactElement {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo" aria-hidden="true">
        <Shield size={20} />
      </div>
      <nav aria-label="Primary" className="sidebar-nav">
        {appRoutes.map(route => (
          <Tooltip key={route.id} label={route.label}>
            <button
              aria-label={route.label}
              aria-current={activeRoute === route.id ? 'page' : undefined}
              className={['sidebar-item', activeRoute === route.id ? 'is-active' : '']
                .filter(Boolean)
                .join(' ')}
              type="button"
              onClick={() => onRouteChange(route.id)}
            >
              {ICONS[route.id]}
            </button>
          </Tooltip>
        ))}
      </nav>
    </aside>
  )
}
