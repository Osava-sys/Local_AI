import type { ReactNode } from 'react'

interface TooltipProps {
  label: string
  side?: 'top' | 'right'
  children: ReactNode
}

export function Tooltip({ label, side = 'top', children }: TooltipProps): React.ReactElement {
  return (
    <span className="tooltip">
      {children}
      <span className="tooltip-content" data-side={side} role="tooltip">
        {label}
      </span>
    </span>
  )
}
