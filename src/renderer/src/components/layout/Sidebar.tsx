import {
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileWarning,
  History,
  Package,
  PanelLeftClose,
  Settings,
  Shield,
  X,
} from 'lucide-react'
import { appRoutes, appRouteSections, type AppRoute, type AppRouteId } from '../../routes'
import { Tooltip } from '../ui/Tooltip'
import nexusLogo from '../../assets/nexus-logo.png'

export type SidebarMode = 'expanded' | 'collapsed' | 'hidden'

interface SidebarProps {
  activeRoute: AppRouteId
  isMobile: boolean
  mobileOpen: boolean
  mode: SidebarMode
  onCloseMobile(): void
  onHide(): void
  onRouteChange(route: AppRouteId): void
  onToggle(): void
}

const ICONS: Record<AppRouteId, React.ReactElement> = {
  dashboard: <BarChart3 size={18} />,
  'agent-runs': <Bot size={19} />,
  approvals: <ClipboardCheck size={18} />,
  models: <Package size={18} />,
  sandbox: <Shield size={18} />,
  'audit-log': <History size={18} />,
  'risk-reports': <FileWarning size={18} />,
  settings: <Settings size={18} />,
}

export function Sidebar({
  activeRoute,
  isMobile,
  mobileOpen,
  mode,
  onCloseMobile,
  onHide,
  onRouteChange,
  onToggle,
}: SidebarProps): React.ReactElement {
  const compact = !isMobile && mode === 'collapsed'
  const hidden = !isMobile && mode === 'hidden'
  const visible = isMobile ? mobileOpen : !hidden

  function navigate(route: AppRouteId): void {
    onRouteChange(route)
    if (isMobile) onCloseMobile()
  }

  return (
    <aside
      aria-hidden={!visible}
      className="app-sidebar"
      data-compact={compact}
      data-mobile={isMobile}
      data-open={visible}
    >
      <header className="sidebar-header">
        <span className="sidebar-brand-mark" role="img" aria-label="NEXUS">
          <img src={nexusLogo} alt="" />
        </span>
        {!compact && (
          <span className="sidebar-brand-copy">
            <strong>NEXUS</strong>
            <small>Cyberdéfense locale</small>
          </span>
        )}
        <div className="sidebar-header__actions">
          {isMobile ? (
            <button aria-label="Fermer la navigation" type="button" onClick={onCloseMobile}>
              <X size={17} />
            </button>
          ) : (
            <>
              <button
                aria-label={compact ? 'Déplier la barre latérale' : 'Réduire la barre latérale'}
                title={compact ? 'Déplier (Ctrl+B)' : 'Réduire (Ctrl+B)'}
                type="button"
                onClick={onToggle}
              >
                {compact ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
              </button>
              <button
                aria-label="Masquer la barre latérale"
                title="Masquer complètement"
                type="button"
                onClick={onHide}
              >
                <PanelLeftClose size={17} />
              </button>
            </>
          )}
        </div>
      </header>

      <nav aria-label="Navigation principale" className="sidebar-nav">
        {appRouteSections.map((section) => {
          const routes = appRoutes.filter((route) => route.section === section.id)
          if (routes.length === 0) return null
          return (
            <section
              className={
                section.id === 'system'
                  ? 'sidebar-section sidebar-section--system'
                  : 'sidebar-section'
              }
              key={section.id}
            >
              {!compact && <h2>{section.label}</h2>}
              <div className="sidebar-section__items">
                {routes.map((route) => (
                  <SidebarNavItem
                    active={activeRoute === route.id}
                    compact={compact}
                    key={route.id}
                    route={route}
                    onSelect={() => navigate(route.id)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </nav>
    </aside>
  )
}

function SidebarNavItem({
  active,
  compact,
  route,
  onSelect,
}: {
  active: boolean
  compact: boolean
  route: AppRoute
  onSelect(): void
}): React.ReactElement {
  const button = (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? route.label : undefined}
      className={active ? 'sidebar-item is-active' : 'sidebar-item'}
      type="button"
      onClick={onSelect}
    >
      <span className="sidebar-item__icon">{ICONS[route.id]}</span>
      {!compact && (
        <span className="sidebar-item__copy">
          <strong>{route.label}</strong>
        </span>
      )}
      {!compact && active && <span className="sidebar-item__active-dot" />}
    </button>
  )

  return compact ? (
    <Tooltip label={route.label} side="right">
      {button}
    </Tooltip>
  ) : (
    button
  )
}
