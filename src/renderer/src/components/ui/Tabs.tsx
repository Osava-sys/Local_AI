export interface TabItem<T extends string> {
  id: T
  label: string
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[]
  active: T
  onChange(id: T): void
}

export function Tabs<T extends string>({ tabs, active, onChange }: TabsProps<T>): React.ReactElement {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(tab => (
        <button
          aria-selected={active === tab.id}
          className={['tab', active === tab.id ? 'is-active' : ''].filter(Boolean).join(' ')}
          key={tab.id}
          role="tab"
          type="button"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
