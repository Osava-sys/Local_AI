import { useEffect, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Switch } from '../components/ui/Switch'

type ThemeMode = 'light' | 'dark'

interface SettingsProps {
  theme: ThemeMode
  onThemeChange(theme: ThemeMode): void
}

export default function Settings({ theme, onThemeChange }: SettingsProps): React.ReactElement {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh(): Promise<void> {
    const result = await window.api.settings.getAll()
    if (result.ok) setSettings(result.value)
  }

  async function saveTheme(nextTheme: ThemeMode): Promise<void> {
    const result = await window.api.settings.set('theme', nextTheme)
    if (result.ok) {
      onThemeChange(nextTheme)
      setStatus(`Theme saved: ${nextTheme}`)
      await refresh()
    } else {
      setStatus(result.error)
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <SettingsIcon size={17} />
            Settings
          </div>
          <Button size="sm" variant="ghost" onClick={refresh}>
            Refresh
          </Button>
        </div>
        <div className="panel-body">
          <div className="dashboard-row">
            <strong>Theme</strong>
            <Switch checked={theme === 'dark'} label={theme === 'dark' ? 'Dark' : 'Light'} onCheckedChange={checked => void saveTheme(checked ? 'dark' : 'light')} />
          </div>
          {status && <p className="muted">{status}</p>}
          <pre className="json-block">{JSON.stringify(settings, null, 2)}</pre>
        </div>
      </section>
    </div>
  )
}
