import React, { useEffect, useState } from 'react'
import type { Chat } from '@shared/types/chat.types'
import type { AgentRunStep } from '@shared/types/agent.types'
import type { LocalModelRecord, ModelDownloadProgress, ModelRuntimeStatus } from '@shared/types/model.types'
import { ApprovalQueue } from './components/agent/ApprovalQueue'

export default function App() {
  const [pong, setPong] = useState<string | null>(null)
  const [theme, setTheme] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [agentPrompt, setAgentPrompt] = useState('Dis-moi ton nom et propose une première action de diagnostic local sans danger.')
  const [agentRunId, setAgentRunId] = useState<string | null>(null)
  const [agentState, setAgentState] = useState<string>('idle')
  const [agentSteps, setAgentSteps] = useState<AgentRunStep[]>([])
  const [agentError, setAgentError] = useState<string | null>(null)
  const [models, setModels] = useState<LocalModelRecord[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [localModelPath, setLocalModelPath] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [llamaServerPath, setLlamaServerPath] = useState('')
  const [mmprojPath, setMmprojPath] = useState('')
  const [device, setDevice] = useState<'gpu' | 'cpu'>('gpu')
  const [gpuLayers, setGpuLayers] = useState(35)
  const [contextLength, setContextLength] = useState(32768)
  const [runtimeStatus, setRuntimeStatus] = useState<ModelRuntimeStatus | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    window.api.ping().then(setPong)

    window.api.settings.get('theme').then(r => {
      if (r.ok) setTheme(r.value ?? '(not set)')
    })

    window.api.chat.list().then(r => {
      if (r.ok) setChats(r.value)
    })
    refreshModels()
    window.api.model.status().then(r => {
      if (r.ok) setRuntimeStatus(r.value)
    })

    const offStep = window.api.agent.on('step', step => {
      setAgentSteps(prev => [...prev, step])
    })
    const offState = window.api.agent.on('state', payload => {
      setAgentState(payload.state)
    })
    const offError = window.api.agent.on('error', payload => {
      setAgentError(payload.error)
      setAgentState('error')
    })
    const offModelProgress = window.api.model.on('downloadProgress', setDownloadProgress)
    const offRuntimeState = window.api.model.on('runtimeState', setRuntimeStatus)

    return () => {
      offStep()
      offState()
      offError()
      offModelProgress()
      offRuntimeState()
    }
  }, [])

  async function refreshModels() {
    const r = await window.api.model.list()
    if (r.ok) {
      setModels(r.value)
      const active = r.value.find(model => model.isActive) ?? r.value[0]
      if (active) setSelectedModelId(active.id)
    }
  }

  async function handleSetTheme() {
    const r = await window.api.settings.set('theme', 'dark')
    if (r.ok) {
      setStatus('theme saved → "dark". Reload to confirm persistence.')
      const r2 = await window.api.settings.get('theme')
      if (r2.ok) setTheme(r2.value ?? '(null)')
    }
  }

  async function handleCreateChat() {
    const r = await window.api.chat.create('Demo chat')
    if (r.ok) {
      setChats(prev => [r.value, ...prev])
      setStatus(`chat created: ${r.value.id}`)
    }
  }

  async function handleStartAgent() {
    setAgentSteps([])
    setAgentError(null)
    setAgentState('starting')

    const r = await window.api.agent.start('default', agentPrompt, {
      maxSteps: 10,
      timeoutPerStep: 30000,
      totalTimeout: 300000,
    })

    if (r.ok) {
      setAgentRunId(r.value.runId)
      setStatus(`agent run started: ${r.value.runId}`)
    } else {
      setAgentError(r.error)
      setAgentState('error')
    }
  }

  async function handleStopAgent() {
    if (!agentRunId) return
    const r = await window.api.agent.stop(agentRunId)
    if (r.ok) setStatus(`agent run stopped: ${agentRunId}`)
    else setAgentError(r.error)
  }

  async function handleSelectGguf() {
    const r = await window.api.model.selectGguf()
    if (r.ok && r.value) setLocalModelPath(r.value.path)
  }

  async function handleSelectLlamaServer() {
    const r = await window.api.model.selectLlamaServer()
    if (r.ok && r.value) setLlamaServerPath(r.value.path)
  }

  async function handleRegisterLocalModel() {
    const r = await window.api.model.registerLocal(localModelPath)
    if (r.ok) {
      setStatus(`model registered: ${r.value.name}`)
      await refreshModels()
      setSelectedModelId(r.value.id)
    } else {
      setStatus(r.error)
    }
  }

  async function handleDownloadModel() {
    setDownloadProgress(null)
    const r = await window.api.model.download({ url: downloadUrl })
    if (r.ok) {
      setStatus(`model downloaded: ${r.value.name}`)
      await refreshModels()
      setSelectedModelId(r.value.id)
    } else {
      setStatus(r.error)
    }
  }

  async function handleLoadModel() {
    if (!selectedModelId) return
    const r = await window.api.model.load({
      modelId: selectedModelId,
      device,
      executablePath: llamaServerPath || undefined,
      mmprojPath: mmprojPath || undefined,
      gpuLayers,
      contextLength,
      batchSize: 512,
      threads: 8,
      flashAttention: device === 'gpu',
    })

    if (r.ok) {
      setRuntimeStatus(r.value)
      setStatus(r.value.state === 'running' ? `model loaded: ${r.value.modelName}` : r.value.error ?? 'model load finished')
      await refreshModels()
    } else {
      setStatus(r.error)
    }
  }

  async function handleUnloadModel() {
    const r = await window.api.model.unload()
    if (r.ok) {
      setRuntimeStatus(await window.api.model.status().then(result => result.ok ? result.value : null))
      setStatus('model unloaded')
    } else {
      setStatus(r.error)
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 920 }}>
      <h1>Local AI — Phase 3</h1>

      <section>
        <h2>IPC ping</h2>
        <p><code>window.api.ping()</code> → <strong>{pong ?? '…'}</strong></p>
      </section>

      <section>
        <h2>Settings (SQLite)</h2>
        <p>theme = <strong>{theme ?? '…'}</strong></p>
        <button onClick={handleSetTheme}>set theme = "dark"</button>
      </section>

      <section>
        <h2>Chats ({chats.length})</h2>
        <button onClick={handleCreateChat}>Create chat</button>
        <ul>
          {chats.map(c => (
            <li key={c.id}>{c.title} — <code style={{ fontSize: '0.75em' }}>{c.id}</code></li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '2rem', borderTop: '1px solid #ddd', paddingTop: '1rem' }}>
        <h2>Models</h2>
        <p>
          runtime = <strong>{runtimeStatus?.state ?? 'idle'}</strong>
          {runtimeStatus?.endpoint && <> — <code>{runtimeStatus.endpoint}</code></>}
        </p>
        {runtimeStatus?.error && (
          <p style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>
            {runtimeStatus.error}
          </p>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            GGUF local
            <input
              value={localModelPath}
              onChange={event => setLocalModelPath(event.target.value)}
              placeholder="D:\\Models\\qwen3.5-9b-uncensored-hauhaucs-aggressive.Q8_0.gguf"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleSelectGguf}>Select GGUF</button>
            <button onClick={handleRegisterLocalModel} disabled={!localModelPath}>Register Local Model</button>
          </div>

          <label>
            Download GGUF URL
            <input
              value={downloadUrl}
              onChange={event => setDownloadUrl(event.target.value)}
              placeholder="https://.../model.Q8_0.gguf"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>
          <button onClick={handleDownloadModel} disabled={!downloadUrl}>Download Model</button>
          {downloadProgress && (
            <p>
              download = <strong>{downloadProgress.status}</strong>
              {downloadProgress.percent !== null && <> — {downloadProgress.percent}%</>}
            </p>
          )}

          <label>
            llama.cpp server executable
            <input
              value={llamaServerPath}
              onChange={event => setLlamaServerPath(event.target.value)}
              placeholder="Select llama-server.exe, or set LLAMA_CPP_SERVER_PATH"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>
          <button onClick={handleSelectLlamaServer}>Select llama-server.exe</button>

          <label>
            mmproj (vision) — optionnel, vide = détection auto à côté du modèle
            <input
              value={mmprojPath}
              onChange={event => setMmprojPath(event.target.value)}
              placeholder="mmproj-*.gguf (auto-détecté si laissé vide)"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>

          <label>
            Registered models
            <select
              value={selectedModelId}
              onChange={event => setSelectedModelId(event.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            >
              <option value="">No model selected</option>
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.isActive ? '* ' : ''}{model.name} — {(model.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB — {model.quantization}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label>
              Device
              <select value={device} onChange={event => setDevice(event.target.value as 'gpu' | 'cpu')}>
                <option value="gpu">GPU</option>
                <option value="cpu">CPU</option>
              </select>
            </label>
            <label>
              GPU layers
              <input type="number" min={0} max={200} value={gpuLayers} onChange={event => setGpuLayers(Number(event.target.value))} />
            </label>
            <label>
              Context
              <input type="number" min={512} max={262144} value={contextLength} onChange={event => setContextLength(Number(event.target.value))} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleLoadModel} disabled={!selectedModelId}>Load Model</button>
            <button onClick={handleUnloadModel}>Unload Model</button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: '2rem', borderTop: '1px solid #ddd', paddingTop: '1rem' }}>
        <h2>Nexus Agent</h2>
        <p>state = <strong>{agentState}</strong></p>
        <textarea
          value={agentPrompt}
          onChange={event => setAgentPrompt(event.target.value)}
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={handleStartAgent}>Start Agent</button>
          <button onClick={handleStopAgent} disabled={!agentRunId}>Stop Agent</button>
        </div>

        {agentRunId && <p>run = <code>{agentRunId}</code></p>}
        {agentError && <p style={{ color: 'crimson' }}>{agentError}</p>}

        <div style={{ marginTop: '1.5rem', borderTop: '1px dashed #ccc', paddingTop: '1rem' }}>
          <ApprovalQueue />
        </div>

        <ol>
          {agentSteps.map((step, index) => (
            <li key={step.id ?? `${index}-${step.timestamp}`} style={{ marginBottom: 12 }}>
              <strong>{step.type}</strong>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12 }}>
                {step.content}
              </pre>
              {step.toolCall && (
                <code>
                  {step.toolCall.name} — {step.toolCall.status}
                </code>
              )}
            </li>
          ))}
        </ol>
      </section>

      {status && <p style={{ color: 'green' }}>{status}</p>}
    </div>
  )
}
