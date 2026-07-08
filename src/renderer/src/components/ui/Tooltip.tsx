import type { ReactNode } from 'react'

interface TooltipProps {
  label: string
  children: ReactNode
}

export function Tooltip({ label, children }: TooltipProps): React.ReactElement {
  return (
    <span className="tooltip">
      {children}
      <span className="tooltip-content" role="tooltip">
        {label}
      </span>
    </span>
  )
}
