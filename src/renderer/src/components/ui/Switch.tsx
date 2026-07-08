import type { ReactNode } from 'react'

interface SwitchProps {
  checked: boolean
  onCheckedChange(checked: boolean): void
  label?: ReactNode
}

export function Switch({ checked, onCheckedChange, label }: SwitchProps): React.ReactElement {
  return (
    <button
      aria-checked={checked}
      className="switch"
      role="switch"
      type="button"
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="switch-track" />
      {label && <span>{label}</span>}
    </button>
  )
}
