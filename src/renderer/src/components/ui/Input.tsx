import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Input({ label, className, ...props }: InputProps): React.ReactElement {
  const input = <input className={['input', className ?? ''].filter(Boolean).join(' ')} {...props} />
  if (!label) return input
  return (
    <div className="field">
      <label>{label}</label>
      {input}
    </div>
  )
}

export function Textarea({ label, className, ...props }: TextareaProps): React.ReactElement {
  const textarea = (
    <textarea className={['textarea', className ?? ''].filter(Boolean).join(' ')} {...props} />
  )
  if (!label) return textarea
  return (
    <div className="field">
      <label>{label}</label>
      {textarea}
    </div>
  )
}
