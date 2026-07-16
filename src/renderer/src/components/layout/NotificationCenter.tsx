import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Bot, CheckCheck, ChevronRight, Clock3, Cpu, Shield, Trash2, X } from 'lucide-react'
import type { AgentState } from '@shared/types/agent.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import type { AppRouteId } from '../../routes'
import {
  buildSystemNotifications,
  type SystemNotificationId,
  type SystemNotificationItem,
} from '../../lib/system-notifications'
import { Badge } from '../ui/Badge'

interface NotificationCenterProps {
  agentState: AgentState | 'starting'
  modelStatus: ModelRuntimeStatus | null
  pendingApprovals: number
  sandboxActive: boolean
  lastMessage?: string | null
  onNavigate(route: AppRouteId): void
}

interface ActivityNotification {
  id: number
  message: string
  createdAt: number
}

const ROUTE_BY_STATUS: Record<SystemNotificationId, AppRouteId> = {
  model: 'models',
  agent: 'agent-runs',
  approvals: 'approvals',
  sandbox: 'sandbox',
}

export function NotificationCenter({
  agentState,
  modelStatus,
  pendingApprovals,
  sandboxActive,
  lastMessage,
  onNavigate,
}: NotificationCenterProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [activity, setActivity] = useState<ActivityNotification[]>([])
  const previousMessage = useRef<string | null>(null)
  const eventId = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const items = useMemo(
    () => buildSystemNotifications({ agentState, modelStatus, pendingApprovals, sandboxActive }),
    [agentState, modelStatus, pendingApprovals, sandboxActive]
  )
  const attentionCount = items.filter(
    (item) => item.tone === 'warning' || item.tone === 'danger'
  ).length

  useEffect(() => {
    if (!lastMessage || lastMessage === previousMessage.current) return
    previousMessage.current = lastMessage
    eventId.current += 1
    setActivity((current) =>
      [{ id: eventId.current, message: lastMessage, createdAt: Date.now() }, ...current].slice(0, 8)
    )
    if (!open) setUnread((current) => Math.min(current + 1, 9))
  }, [lastMessage, open])

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event: PointerEvent): void {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggle(): void {
    setOpen((current) => {
      const next = !current
      if (next) setUnread(0)
      return next
    })
  }

  function navigate(item: SystemNotificationItem): void {
    setOpen(false)
    onNavigate(ROUTE_BY_STATUS[item.id])
  }

  return (
    <div className="notification-center" ref={root}>
      <button
        aria-controls="system-notification-panel"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications système${unread > 0 ? `, ${unread} non lue${unread > 1 ? 's' : ''}` : ''}`}
        className="notification-trigger"
        type="button"
        onClick={toggle}
      >
        <span className="notification-trigger__icon">
          <Bell size={17} />
          {unread > 0 && <span className="notification-trigger__count">{unread}</span>}
          {unread === 0 && attentionCount > 0 && (
            <span className="notification-trigger__attention" />
          )}
        </span>
        <span className="notification-trigger__label">
          <strong>Notifications</strong>
          <small>
            {attentionCount > 0
              ? `${attentionCount} état${attentionCount > 1 ? 's' : ''} à vérifier`
              : 'Système nominal'}
          </small>
        </span>
      </button>

      {open && (
        <section
          aria-label="Centre de notifications"
          className="notification-panel"
          id="system-notification-panel"
          role="dialog"
        >
          <header className="notification-panel__header">
            <div>
              <strong>Centre de notifications</strong>
              <span>État du système en temps réel</span>
            </div>
            <button
              aria-label="Fermer les notifications"
              type="button"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>

          <div className="notification-panel__section">
            <div className="notification-panel__section-title">
              <span>État opérationnel</span>
              <Badge tone={attentionCount > 0 ? 'warning' : 'success'}>
                {attentionCount > 0 ? 'À vérifier' : 'Nominal'}
              </Badge>
            </div>
            <div className="system-status-list">
              {items.map((item) => (
                <button
                  className="system-status-item"
                  data-tone={item.tone}
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item)}
                >
                  <span className="system-status-item__icon">{statusIcon(item.id)}</span>
                  <span className="system-status-item__body">
                    <span>
                      <strong>{item.title}</strong>
                      <Badge tone={item.tone}>{item.label}</Badge>
                    </span>
                    <small>{item.description}</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </div>

          <div className="notification-panel__section notification-activity">
            <div className="notification-panel__section-title">
              <span>Activité récente</span>
              {activity.length > 0 && (
                <button
                  aria-label="Effacer l’activité récente"
                  title="Effacer l’activité récente"
                  type="button"
                  onClick={() => setActivity([])}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            {activity.length === 0 ? (
              <div className="notification-empty">
                <CheckCheck size={18} />
                <span>Aucune nouvelle activité.</span>
              </div>
            ) : (
              <ol>
                {activity.map((event) => (
                  <li key={event.id}>
                    <span className="notification-activity__marker" />
                    <div>
                      <p>{event.message}</p>
                      <time>
                        <Clock3 size={11} /> {formatClock(event.createdAt)}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function statusIcon(id: SystemNotificationId): React.ReactElement {
  switch (id) {
    case 'model':
      return <Cpu size={16} />
    case 'agent':
      return <Bot size={16} />
    case 'approvals':
      return <CheckCheck size={16} />
    case 'sandbox':
      return <Shield size={16} />
  }
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}
