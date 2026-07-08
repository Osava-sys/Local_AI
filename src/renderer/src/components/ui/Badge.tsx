import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'critical'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps): React.ReactElement {
  const classes = ['badge', tone !== 'neutral' ? `badge--${tone}` : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{children}</span>
}
