import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import type { AgentState } from '@shared/types/agent.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import type { AppRouteId } from '../../routes'
import { Header } from './Header'
import { Sidebar, type SidebarMode } from './Sidebar'
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
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(readSidebarMode)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 1040px)').matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const lastVisibleMode = useRef<Exclude<SidebarMode, 'hidden'>>(
    readLastVisibleSidebarMode(sidebarMode)
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1040px)')
    function onChange(event: MediaQueryListEvent): void {
      setIsMobile(event.matches)
      setMobileOpen(false)
    }
    setIsMobile(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_MODE_KEY, sidebarMode)
    if (sidebarMode !== 'hidden') {
      lastVisibleMode.current = sidebarMode
      window.localStorage.setItem(SIDEBAR_LAST_VISIBLE_KEY, sidebarMode)
    }
  }, [sidebarMode])

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((current) => !current)
      return
    }
    setSidebarMode((current) => {
      if (current === 'hidden') return lastVisibleMode.current
      return current === 'expanded' ? 'collapsed' : 'expanded'
    })
  }, [isMobile])

  const navigate = useCallback(
    (route: AppRouteId) => {
      onRouteChange(route)
      setMobileOpen(false)
    },
    [onRouteChange]
  )

  useEffect(() => {
    function onShortcut(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      const target = event.target as HTMLElement | null
      const editable =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      if (key === 'b' && !editable) {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [toggleSidebar])

  return (
    <div className="app-shell" data-sidebar={sidebarMode}>
      <Sidebar
        activeRoute={activeRoute}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        mode={sidebarMode}
        onCloseMobile={() => setMobileOpen(false)}
        onHide={() => setSidebarMode('hidden')}
        onRouteChange={navigate}
        onToggle={toggleSidebar}
      />
      {isMobile && mobileOpen && (
        <button
          aria-label="Fermer le menu de navigation"
          className="sidebar-mobile-backdrop"
          type="button"
          onClick={() => setMobileOpen(false)}
        />
      )}
      {!isMobile && sidebarMode === 'hidden' && (
        <button
          aria-label="Restaurer la barre latérale"
          className="sidebar-restore"
          title="Restaurer la navigation (Ctrl+B)"
          type="button"
          onClick={toggleSidebar}
        >
          <PanelLeftOpen size={18} />
        </button>
      )}
      <Header
        activeRoute={activeRoute}
        agentState={agentState}
        canStop={canStop}
        lastMessage={lastMessage}
        modelStatus={modelStatus}
        pendingApprovals={pendingApprovals}
        sandboxActive={sandboxActive}
        theme={theme}
        onNavigate={navigate}
        onNewRun={onNewRun}
        onOpenSidebar={() => setMobileOpen(true)}
        onSettings={onSettings}
        onStart={onStart}
        onStop={onStop}
        onToggleTheme={onToggleTheme}
      />
      <main className="app-main">{children}</main>
      <StatusBar agentState={agentState} currentRunId={currentRunId} lastMessage={lastMessage} />
    </div>
  )
}

const SIDEBAR_MODE_KEY = 'nexus.sidebar.mode.v1'
const SIDEBAR_LAST_VISIBLE_KEY = 'nexus.sidebar.last-visible.v1'

function readSidebarMode(): SidebarMode {
  const saved = window.localStorage.getItem(SIDEBAR_MODE_KEY)
  if (saved === 'expanded' || saved === 'collapsed' || saved === 'hidden') return saved
  const lastVisible = window.localStorage.getItem(SIDEBAR_LAST_VISIBLE_KEY)
  if (lastVisible === 'expanded' || lastVisible === 'collapsed') return lastVisible
  return 'expanded'
}

function readLastVisibleSidebarMode(current: SidebarMode): Exclude<SidebarMode, 'hidden'> {
  const saved = window.localStorage.getItem(SIDEBAR_LAST_VISIBLE_KEY)
  if (saved === 'expanded' || saved === 'collapsed') return saved
  return current === 'expanded' ? 'expanded' : 'collapsed'
}
