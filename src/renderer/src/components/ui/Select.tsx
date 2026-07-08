import type { ReactNode, SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  children: ReactNode
}

export function Select({ label, className, children, ...props }: SelectProps): React.ReactElement {
  const select = (
    <select className={['select', className ?? ''].filter(Boolean).join(' ')} {...props}>
      {children}
    </select>
  )
  if (!label) return select
  return (
    <div className="select-field">
      <label>{label}</label>
      {select}
    </div>
  )
}
