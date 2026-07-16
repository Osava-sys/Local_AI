import { useCallback, useEffect, useState } from 'react'
import type { AgentState } from '@shared/types/agent.types'
import type { ModelRuntimeStatus } from '@shared/types/model.types'
import { AppShell } from './components/layout/AppShell'
import { useApproval } from './hooks/use-approval'
import {
  DEFAULT_AGENT_PREFERENCES,
  buildMissionPrompt,
  readAgentPreferences,
  resolveAgentExecutionOptions,
  type AgentPreferences,
  type PromptSubmission,
} from './lib/mission-preferences'
import { useAgentStore } from './stores/agent.store'
import type { AppRouteId } from './routes'
import AgentRuns from './pages/AgentRuns'
import Approvals from './pages/Approvals'
import AuditLog from './pages/AuditLog'
import Dashboard from './pages/Dashboard'
import Models from './pages/Models'
import RiskReports from './pages/RiskReports'
import Sandbox from './pages/Sandbox'
import Settings from './pages/Settings'

type ThemeMode = 'light' | 'dark'

const DEFAULT_PROMPT =
  'Run a safe local defensive diagnostic. Start with observations only, then ask for human approval before any sensitive action.'

export default function App(): React.ReactElement {
  const [activeRoute, setActiveRoute] = useState<AppRouteId>('agent-runs')
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [agentPreferences, setAgentPreferences] =
    useState<AgentPreferences>(DEFAULT_AGENT_PREFERENCES)
  const [modelStatus, setModelStatus] = useState<ModelRuntimeStatus | null>(null)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  const { pending, recent } = useApproval()
  const currentRunId = useAgentStore((state) => state.currentRunId)
  const agentState = useAgentStore((state) => state.state)
  const steps = useAgentStore((state) => state.steps)
  const error = useAgentStore((state) => state.error)
  const setRun = useAgentStore((state) => state.setRun)
  const setAgentState = useAgentStore((state) => state.setState)
  const setError = useAgentStore((state) => state.setError)
  const appendStep = useAgentStore((state) => state.appendStep)
  const clearSteps = useAgentStore((state) => state.clearSteps)
  const resetSession = useAgentStore((state) => state.resetSession)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    window.api.settings.getAll().then((result) => {
      if (result.ok) {
        if (result.value.theme === 'light' || result.value.theme === 'dark') {
          setTheme(result.value.theme)
        }
        setAgentPreferences(readAgentPreferences(result.value))
      }
    })
    window.api.model.status().then((result) => {
      if (result.ok) setModelStatus(result.value)
    })

    const offStep = window.api.agent.on('step', (step) => {
      appendStep(step)
      if (step.runId) setRun(step.runId)
      setLastMessage(`${step.type}: ${step.content.slice(0, 120)}`)
    })
    const offState = window.api.agent.on('state', (payload) => {
      setRun(payload.runId)
      setAgentState(asAgentState(payload.state))
      setLastMessage(`Agent state: ${payload.state}`)
    })
    const offError = window.api.agent.on('error', (payload) => {
      setError(payload.error)
      setAgentState('error')
      setLastMessage(payload.error)
    })
    const offRuntime = window.api.model.on('runtimeState', (status) => {
      setModelStatus(status)
      setLastMessage(
        status.state === 'running' ? `Model loaded: ${status.modelName}` : `Model ${status.state}`
      )
    })
    const offDownload = window.api.model.on('downloadProgress', (progress) => {
      setLastMessage(
        progress.percent === null
          ? `Downloading ${progress.filename}`
          : `Downloading ${progress.filename}: ${progress.percent}%`
      )
    })

    return () => {
      offStep()
      offState()
      offError()
      offRuntime()
      offDownload()
    }
  }, [appendStep, setAgentState, setError, setRun])

  const handleThemeChange = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme)
    void window.api.settings.set('theme', nextTheme).then((result) => {
      if (!result.ok) setLastMessage(result.error)
    })
  }, [])

  const handleStart = useCallback(
    async (submission?: PromptSubmission) => {
      const runPrompt = prompt.trim() || DEFAULT_PROMPT
      const effectivePrompt = buildMissionPrompt(runPrompt, submission)
      const executionOptions = resolveAgentExecutionOptions(agentPreferences, submission)
      setActiveRoute('agent-runs')
      clearSteps()
      setError(null)
      setAgentState('starting')

      const result = await window.api.agent.start('default', effectivePrompt, executionOptions)

      if (result.ok) {
        setRun(result.value.runId)
        setLastMessage(`Agent run started: ${result.value.runId}`)
      } else {
        setError(result.error)
        setAgentState('error')
        setLastMessage(result.error)
      }
    },
    [agentPreferences, clearSteps, prompt, setAgentState, setError, setRun]
  )

  const handleStop = useCallback(async () => {
    if (!currentRunId) return
    const result = await window.api.agent.stop(currentRunId)
    if (result.ok) {
      setAgentState('paused')
      setLastMessage(`Agent run stopped: ${currentRunId}`)
    } else {
      setError(result.error)
      setLastMessage(result.error)
    }
  }, [currentRunId, setAgentState, setError])

  const handleNewRun = useCallback(() => {
    resetSession()
    setPrompt(DEFAULT_PROMPT)
    setActiveRoute('agent-runs')
    setLastMessage('New run ready')
  }, [resetSession])

  const canStop = Boolean(
    currentRunId &&
    ['running', 'planning', 'awaiting_approval', 'starting', 'paused'].includes(agentState)
  )
  const sandboxActive =
    pending.length > 0 ||
    steps.some(
      (step) => step.toolCall?.status === 'running' || step.toolCall?.status === 'requires_approval'
    )

  return (
    <AppShell
      activeRoute={activeRoute}
      agentState={agentState}
      canStop={canStop}
      currentRunId={currentRunId}
      lastMessage={lastMessage}
      modelStatus={modelStatus}
      pendingApprovals={pending.length}
      sandboxActive={sandboxActive}
      theme={theme}
      onNewRun={handleNewRun}
      onRouteChange={setActiveRoute}
      onSettings={() => setActiveRoute('settings')}
      onStart={handleStart}
      onStop={handleStop}
      onToggleTheme={handleThemeChange}
    >
      {renderRoute(activeRoute, {
        agentState,
        agentPreferences,
        currentRunId,
        error,
        modelStatus,
        pending,
        prompt,
        recent,
        setActiveRoute,
        setPrompt,
        steps,
        theme,
        handleNewRun,
        handleStart,
        handleStop,
        handleThemeChange,
        setAgentPreferences,
      })}
    </AppShell>
  )
}

function renderRoute(
  activeRoute: AppRouteId,
  context: {
    agentState: AgentState | 'starting'
    agentPreferences: AgentPreferences
    currentRunId: string | null
    error: string | null
    modelStatus: ModelRuntimeStatus | null
    pending: ReturnType<typeof useApproval>['pending']
    prompt: string
    recent: ReturnType<typeof useApproval>['recent']
    setActiveRoute(route: AppRouteId): void
    setPrompt(prompt: string): void
    steps: ReturnType<typeof useAgentStore.getState>['steps']
    theme: ThemeMode
    handleNewRun(): void
    handleStart(submission?: PromptSubmission): void
    handleStop(): void
    handleThemeChange(theme: ThemeMode): void
    setAgentPreferences(preferences: AgentPreferences): void
  }
): React.ReactElement {
  switch (activeRoute) {
    case 'dashboard':
      return (
        <Dashboard
          agentState={context.agentState}
          modelStatus={context.modelStatus}
          pendingApprovals={context.pending.length}
          steps={context.steps}
          onNavigate={context.setActiveRoute}
        />
      )
    case 'approvals':
      return <Approvals />
    case 'models':
      return <Models />
    case 'sandbox':
      return <Sandbox />
    case 'audit-log':
      return <AuditLog />
    case 'risk-reports':
      return <RiskReports />
    case 'settings':
      return (
        <Settings
          preferences={context.agentPreferences}
          theme={context.theme}
          onPreferencesChange={context.setAgentPreferences}
          onThemeChange={context.handleThemeChange}
        />
      )
    case 'agent-runs':
    default:
      return (
        <AgentRuns
          currentRunId={context.currentRunId}
          error={context.error}
          modelStatus={context.modelStatus}
          pendingApprovals={context.pending}
          prompt={context.prompt}
          recentApprovals={context.recent}
          state={context.agentState}
          steps={context.steps}
          preferences={context.agentPreferences}
          onPromptChange={context.setPrompt}
          onStart={context.handleStart}
          onStop={context.handleStop}
        />
      )
  }
}

function asAgentState(value: string): AgentState {
  const known: AgentState[] = [
    'idle',
    'planning',
    'awaiting_approval',
    'running',
    'done',
    'error',
    'paused',
    'blocked',
  ]
  return known.includes(value as AgentState) ? (value as AgentState) : 'running'
}
