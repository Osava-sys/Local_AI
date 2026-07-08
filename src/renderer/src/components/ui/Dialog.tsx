import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose(): void
}

export function Dialog({ open, title, children, footer, onClose }: DialogProps): React.ReactElement | null {
  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="dialog-panel"
        role="dialog"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="dialog-header">
          <strong>{title}</strong>
          <Button aria-label="Close dialog" iconOnly variant="ghost" onClick={onClose}>
            <X size={16} />
          </Button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-actions">{footer}</footer>}
      </section>
    </div>
  )
}
