import type { ReactNode } from 'react'

export interface ToastMessage {
  id: string
  title: string
  description?: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}

interface ToastRegionProps {
  messages: ToastMessage[]
  actions?: ReactNode
}

export function ToastRegion({ messages, actions }: ToastRegionProps): React.ReactElement | null {
  if (messages.length === 0 && !actions) return null

  return (
    <div aria-live="polite" className="toast-region">
      {messages.map(message => (
        <div className={`toast toast--${message.tone ?? 'neutral'}`} key={message.id}>
          <strong>{message.title}</strong>
          {message.description && <div className="muted">{message.description}</div>}
        </div>
      ))}
      {actions}
    </div>
  )
}
