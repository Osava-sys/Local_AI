import { useEffect, useState } from 'react'
import {
  BrainCog,
  Check,
  Clock3,
  Crosshair,
  Database,
  FolderCode,
  Globe2,
  HardDrive,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
} from 'lucide-react'
import {
  AGENT_PREFERENCE_KEYS,
  DEFAULT_AGENT_PREFERENCES,
  readAgentPreferences,
  serializeAgentPreferences,
  type AgentPreferences,
  type ComposerDefaultMode,
} from '../lib/mission-preferences'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Switch } from '../components/ui/Switch'

type ThemeMode = 'light' | 'dark'
type PreferenceField = keyof AgentPreferences

interface SettingsProps {
  theme: ThemeMode
  preferences: AgentPreferences
  onThemeChange(theme: ThemeMode): void
  onPreferencesChange(preferences: AgentPreferences): void
}

interface SaveStatus {
  message: string
  tone: BadgeTone
}

const STORAGE_KEY_BY_FIELD: Record<PreferenceField, string> = {
  maxSteps: AGENT_PREFERENCE_KEYS.maxSteps,
  timeoutPerStep: AGENT_PREFERENCE_KEYS.timeoutPerStep,
  totalTimeout: AGENT_PREFERENCE_KEYS.totalTimeout,
  composerDefaultMode: AGENT_PREFERENCE_KEYS.composerDefaultMode,
  captureContextByDefault: AGENT_PREFERENCE_KEYS.captureContextByDefault,
}

const STEP_OPTIONS = [6, 10, 14, 20, 30, 50]
const STEP_TIMEOUT_OPTIONS = [15_000, 30_000, 60_000, 120_000]
const TOTAL_TIMEOUT_OPTIONS = [180_000, 300_000, 600_000, 1_200_000]

export default function Settings({
  theme,
  preferences,
  onThemeChange,
  onPreferencesChange,
}: SettingsProps): React.ReactElement {
  const [draft, setDraft] = useState(preferences)
  const [storedSettingKeys, setStoredSettingKeys] = useState<Set<string>>(() => new Set())
  const [status, setStatus] = useState<SaveStatus | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [savingField, setSavingField] = useState<PreferenceField | 'reset' | null>(null)

  useEffect(() => setDraft(preferences), [preferences])

  useEffect(() => {
    void refresh(false)
  }, [])

  async function refresh(announce = true): Promise<void> {
    setIsRefreshing(true)
    const result = await window.api.settings.getAll()
    setIsRefreshing(false)
    if (!result.ok) {
      setStatus({ message: result.error, tone: 'danger' })
      return
    }

    const next = readAgentPreferences(result.value)
    setDraft(next)
    setStoredSettingKeys(new Set(Object.keys(result.value)))
    onPreferencesChange(next)
    if (announce) setStatus({ message: 'Paramètres synchronisés', tone: 'success' })
  }

  async function savePreference<K extends PreferenceField>(
    field: K,
    value: AgentPreferences[K],
    successMessage: string
  ): Promise<void> {
    const next = { ...draft, [field]: value }
    const serialized = serializeAgentPreferences(next)
    const storageKey = STORAGE_KEY_BY_FIELD[field]
    setDraft(next)
    setSavingField(field)
    const result = await window.api.settings.set(storageKey, serialized[storageKey])
    setSavingField(null)

    if (!result.ok) {
      setStatus({ message: result.error, tone: 'danger' })
      await refresh(false)
      return
    }

    onPreferencesChange(next)
    setStoredSettingKeys((current) => new Set(current).add(storageKey))
    setStatus({ message: successMessage, tone: 'success' })
  }

  async function resetDefaults(): Promise<void> {
    setSavingField('reset')
    const values = serializeAgentPreferences(DEFAULT_AGENT_PREFERENCES)
    const results = await Promise.all(
      Object.entries(values).map(([key, value]) => window.api.settings.set(key, value))
    )
    setSavingField(null)

    const failure = results.find((result) => !result.ok)
    if (failure && !failure.ok) {
      setStatus({ message: failure.error, tone: 'danger' })
      await refresh(false)
      return
    }

    setDraft(DEFAULT_AGENT_PREFERENCES)
    onPreferencesChange(DEFAULT_AGENT_PREFERENCES)
    onThemeChange('dark')
    setStatus({ message: 'Valeurs par défaut restaurées', tone: 'success' })
    await refresh(false)
  }

  function chooseTheme(nextTheme: ThemeMode): void {
    onThemeChange(nextTheme)
    setStatus({
      message: nextTheme === 'dark' ? 'Thème sombre appliqué' : 'Thème clair appliqué',
      tone: 'success',
    })
  }

  const busy = isRefreshing || savingField !== null
  const storedSettingsCount = storedSettingKeys.size

  return (
    <div className="page settings-page">
      <section className="settings-hero">
        <div className="settings-hero__identity">
          <span className="settings-hero__icon">
            <SettingsIcon size={21} />
          </span>
          <div>
            <span className="section-label">Console locale</span>
            <h1>Paramètres</h1>
            <p>Apparence, comportement de l’agent et préférences du composeur.</p>
          </div>
        </div>
        <div className="settings-hero__actions">
          <span aria-live="polite" className="settings-save-status">
            {status ? (
              <Badge tone={status.tone}>{status.message}</Badge>
            ) : (
              <Badge tone="neutral">Enregistré localement</Badge>
            )}
          </span>
          <Button disabled={busy} size="sm" variant="ghost" onClick={() => void refresh()}>
            <RefreshCw className={isRefreshing ? 'is-spinning' : undefined} size={14} />
            Actualiser
          </Button>
        </div>
      </section>

      <div className="settings-grid">
        <section className="settings-card settings-card--appearance">
          <header className="settings-card__header">
            <span className="settings-card__icon">
              <Palette size={18} />
            </span>
            <div>
              <h2>Apparence</h2>
              <p>Choisissez une interface adaptée à votre environnement.</p>
            </div>
          </header>
          <div className="settings-card__body">
            <div aria-label="Thème de l’interface" className="settings-theme-grid" role="group">
              <button
                aria-pressed={theme === 'light'}
                className="settings-theme-choice"
                data-active={theme === 'light'}
                type="button"
                onClick={() => chooseTheme('light')}
              >
                <span className="settings-theme-preview settings-theme-preview--light">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <Sun size={16} />
                  <strong>Clair</strong>
                </span>
                {theme === 'light' && <Check className="settings-theme-check" size={15} />}
              </button>
              <button
                aria-pressed={theme === 'dark'}
                className="settings-theme-choice"
                data-active={theme === 'dark'}
                type="button"
                onClick={() => chooseTheme('dark')}
              >
                <span className="settings-theme-preview settings-theme-preview--dark">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <Moon size={16} />
                  <strong>Sombre</strong>
                </span>
                {theme === 'dark' && <Check className="settings-theme-check" size={15} />}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-card settings-card--execution">
          <header className="settings-card__header">
            <span className="settings-card__icon">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <h2>Exécution de l’agent</h2>
              <p>Définissez le budget et les délais appliqués à chaque nouvelle mission.</p>
            </div>
            {savingField && savingField !== 'reset' && <Badge tone="accent">Enregistrement…</Badge>}
          </header>
          <div className="settings-card__body settings-form-grid">
            <label className="settings-field">
              <span>Budget d’étapes</span>
              <select
                className="select"
                disabled={busy}
                value={draft.maxSteps}
                onChange={(event) =>
                  void savePreference(
                    'maxSteps',
                    Number(event.target.value),
                    'Budget d’étapes mis à jour'
                  )
                }
              >
                {STEP_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} étapes
                  </option>
                ))}
              </select>
              <small>Le mode Raisonnement garantit au moins 14 étapes.</small>
            </label>

            <label className="settings-field">
              <span>Délai par étape</span>
              <select
                className="select"
                disabled={busy}
                value={draft.timeoutPerStep}
                onChange={(event) =>
                  void savePreference(
                    'timeoutPerStep',
                    Number(event.target.value),
                    'Délai par étape mis à jour'
                  )
                }
              >
                {STEP_TIMEOUT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value / 1_000} secondes
                  </option>
                ))}
              </select>
              <small>Temps maximum accordé à une étape ReAct.</small>
            </label>

            <label className="settings-field">
              <span>Durée totale</span>
              <select
                className="select"
                disabled={busy}
                value={draft.totalTimeout}
                onChange={(event) =>
                  void savePreference(
                    'totalTimeout',
                    Number(event.target.value),
                    'Durée maximale mise à jour'
                  )
                }
              >
                {TOTAL_TIMEOUT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value / 60_000} minutes
                  </option>
                ))}
              </select>
              <small>Limite globale avant interruption contrôlée.</small>
            </label>
          </div>
        </section>

        <section className="settings-card settings-card--composer">
          <header className="settings-card__header">
            <span className="settings-card__icon">
              <BrainCog size={18} />
            </span>
            <div>
              <h2>Prompt box AI</h2>
              <p>Préparez le composeur pour votre flux de travail habituel.</p>
            </div>
          </header>
          <div className="settings-card__body">
            <div className="settings-composer-options">
              <label className="settings-field">
                <span>Mode activé par défaut</span>
                <select
                  className="select"
                  disabled={busy}
                  value={draft.composerDefaultMode}
                  onChange={(event) =>
                    void savePreference(
                      'composerDefaultMode',
                      event.target.value as ComposerDefaultMode,
                      'Mode du composeur mis à jour'
                    )
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="search">Recherche assistée</option>
                  <option value="think">Raisonnement approfondi</option>
                  <option value="canvas">Canvas structuré</option>
                </select>
                <small>Le bouton reste modifiable avant chaque envoi.</small>
              </label>
              <div className="settings-toggle-row">
                <div>
                  <strong>Joindre le contexte automatiquement</strong>
                  <span>Run, état, nœud sélectionné et observations récentes.</span>
                </div>
                <Switch
                  checked={draft.captureContextByDefault}
                  label={draft.captureContextByDefault ? 'Activé' : 'Désactivé'}
                  onCheckedChange={(checked) => {
                    if (busy) return
                    void savePreference(
                      'captureContextByDefault',
                      checked,
                      checked ? 'Contexte automatique activé' : 'Contexte automatique désactivé'
                    )
                  }}
                />
              </div>
            </div>

            <div className="settings-capability-list" aria-label="Guide des fonctions du prompt">
              <Capability
                icon={<Crosshair size={15} />}
                title="Contexte"
                text="Joint la sélection et les dernières preuves du run à la mission."
              />
              <Capability
                icon={<Globe2 size={15} />}
                title="Recherche"
                text="Oriente l’agent vers des sources externes, sous approbation réseau."
              />
              <Capability
                icon={<BrainCog size={15} />}
                title="Raisonnement"
                text="Augmente le budget et impose plan, vérification et incertitudes."
              />
              <Capability
                icon={<FolderCode size={15} />}
                title="Canvas"
                text="Demande un livrable final structuré en blocs réutilisables."
              />
            </div>
          </div>
        </section>

        <section className="settings-card settings-card--security">
          <header className="settings-card__header">
            <span className="settings-card__icon settings-card__icon--success">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2>Sécurité et stockage</h2>
              <p>Les garde-fous sensibles restent actifs indépendamment des préférences.</p>
            </div>
          </header>
          <div className="settings-card__body">
            <div className="settings-trust-grid">
              <TrustItem
                icon={<ShieldCheck size={16} />}
                label="Approbations humaines"
                value="Toujours requises"
              />
              <TrustItem
                icon={<HardDrive size={16} />}
                label="Préférences"
                value="Stockage local"
              />
              <TrustItem
                icon={<Database size={16} />}
                label="Configuration connue"
                value={`${storedSettingsCount} clé${storedSettingsCount > 1 ? 's' : ''}`}
              />
              <TrustItem
                icon={<Clock3 size={16} />}
                label="Limite de mission"
                value={`${draft.totalTimeout / 60_000} min`}
              />
            </div>
            <div className="settings-reset-row">
              <div>
                <strong>Réinitialiser la console</strong>
                <span>Restaure le thème sombre et les préférences d’exécution recommandées.</span>
              </div>
              <Button
                disabled={busy}
                size="sm"
                variant="subtle"
                onClick={() => void resetDefaults()}
              >
                <RotateCcw size={14} />
                {savingField === 'reset' ? 'Réinitialisation…' : 'Valeurs par défaut'}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Capability({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}): React.ReactElement {
  return (
    <div className="settings-capability">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
    </div>
  )
}

function TrustItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.ReactElement {
  return (
    <div className="settings-trust-item">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  )
}
