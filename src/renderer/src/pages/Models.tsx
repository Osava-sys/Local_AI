import { useEffect, useState } from 'react'
import { Cpu, FolderOpen, Package, Play, Square } from 'lucide-react'
import type {
  LocalModelRecord,
  ModelRuntimeDevice,
  ModelRuntimeStatus,
} from '@shared/types/model.types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'

export default function Models(): React.ReactElement {
  const [models, setModels] = useState<LocalModelRecord[]>([])
  const [runtime, setRuntime] = useState<ModelRuntimeStatus | null>(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [ggufPath, setGgufPath] = useState('')
  const [llamaServerPath, setLlamaServerPath] = useState('')
  const [mmprojPath, setMmprojPath] = useState('')
  const [device, setDevice] = useState<ModelRuntimeDevice>('gpu')
  const [gpuLayers, setGpuLayers] = useState(35)
  const [contextLength, setContextLength] = useState(32768)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
    const offRuntime = window.api.model.on('runtimeState', value => setRuntime(value))
    return () => offRuntime()
  }, [])

  async function refresh(): Promise<void> {
    const [listResult, statusResult] = await Promise.all([window.api.model.list(), window.api.model.status()])
    if (listResult.ok) {
      setModels(listResult.value)
      const active = listResult.value.find(model => model.isActive) ?? listResult.value[0]
      if (active) setSelectedModelId(active.id)
    }
    if (statusResult.ok) setRuntime(statusResult.value)
  }

  async function selectGguf(): Promise<void> {
    const result = await window.api.model.selectGguf()
    if (result.ok && result.value) setGgufPath(result.value.path)
  }

  async function selectLlamaServer(): Promise<void> {
    const result = await window.api.model.selectLlamaServer()
    if (result.ok && result.value) setLlamaServerPath(result.value.path)
  }

  async function registerLocal(): Promise<void> {
    const result = await window.api.model.registerLocal(ggufPath)
    if (result.ok) {
      setStatus(`Registered ${result.value.name}`)
      await refresh()
      setSelectedModelId(result.value.id)
    } else {
      setStatus(result.error)
    }
  }

  async function loadModel(): Promise<void> {
    if (!selectedModelId) return
    const result = await window.api.model.load({
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
    if (result.ok) {
      setRuntime(result.value)
      setStatus(result.value.state === 'running' ? `Loaded ${result.value.modelName}` : (result.value.error ?? 'Load finished'))
      await refresh()
    } else {
      setStatus(result.error)
    }
  }

  async function unloadModel(): Promise<void> {
    const result = await window.api.model.unload()
    if (result.ok) {
      setStatus('Model unloaded')
      await refresh()
    } else {
      setStatus(result.error)
    }
  }

  return (
    <div className="page">
      <div className="page-grid">
        <section className="panel" style={{ gridColumn: 'span 4' }}>
          <div className="panel-header">
            <div className="panel-title">
              <Cpu size={17} />
              Runtime
            </div>
            <Badge tone={runtime?.state === 'running' ? 'success' : runtime?.state === 'error' ? 'danger' : 'neutral'}>
              {runtime?.state ?? 'idle'}
            </Badge>
          </div>
          <div className="panel-body">
            <dl className="kv-grid">
              <dt>model</dt>
              <dd>{runtime?.modelName ?? 'none'}</dd>
              <dt>device</dt>
              <dd>{runtime?.device ?? device}</dd>
              <dt>endpoint</dt>
              <dd className="truncate">{runtime?.endpoint ?? 'none'}</dd>
              <dt>pid</dt>
              <dd>{runtime?.pid ?? 'none'}</dd>
            </dl>
            {runtime?.error && <pre className="log-block">{runtime.error}</pre>}
          </div>
        </section>

        <section className="panel" style={{ gridColumn: 'span 8' }}>
          <div className="panel-header">
            <div className="panel-title">
              <Package size={17} />
              Local Models
            </div>
            <Button size="sm" variant="ghost" onClick={refresh}>
              Refresh
            </Button>
          </div>
          <div className="panel-body">
            <div className="toolbar-line">
              <Select value={selectedModelId} onChange={event => setSelectedModelId(event.target.value)}>
                <option value="">No model selected</option>
                {models.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.isActive ? '* ' : ''}{model.name} · {(model.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB · {model.quantization}
                  </option>
                ))}
              </Select>
              <Button disabled={!selectedModelId} variant="primary" onClick={loadModel}>
                <Play size={15} />
                Load
              </Button>
              <Button variant="subtle" onClick={unloadModel}>
                <Square size={14} />
                Unload
              </Button>
            </div>
            <div className="page-grid" style={{ marginTop: 16 }}>
              <div style={{ gridColumn: 'span 4' }}>
                <Select label="Device" value={device} onChange={event => setDevice(event.target.value as ModelRuntimeDevice)}>
                  <option value="gpu">GPU</option>
                  <option value="cpu">CPU</option>
                </Select>
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <Input label="GPU layers" min={0} type="number" value={gpuLayers} onChange={event => setGpuLayers(Number(event.target.value))} />
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <Input label="Context" min={512} type="number" value={contextLength} onChange={event => setContextLength(Number(event.target.value))} />
              </div>
            </div>
          </div>
        </section>

        <section className="panel" style={{ gridColumn: 'span 12' }}>
          <div className="panel-header">
            <div className="panel-title">
              <FolderOpen size={17} />
              Register Local GGUF
            </div>
          </div>
          <div className="panel-body">
            <div className="page-grid">
              <div style={{ gridColumn: 'span 5' }}>
                <Input label="GGUF path" placeholder="D:\\Models\\model.Q8_0.gguf" value={ggufPath} onChange={event => setGgufPath(event.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <Input label="llama-server path" placeholder="optional" value={llamaServerPath} onChange={event => setLlamaServerPath(event.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <Input label="mmproj path" placeholder="optional" value={mmprojPath} onChange={event => setMmprojPath(event.target.value)} />
              </div>
            </div>
            <div className="toolbar-line" style={{ marginTop: 16, justifyContent: 'flex-start' }}>
              <Button variant="subtle" onClick={selectGguf}>Select GGUF</Button>
              <Button variant="subtle" onClick={selectLlamaServer}>Select llama-server</Button>
              <Button disabled={!ggufPath} variant="primary" onClick={registerLocal}>Register</Button>
              {status && <span className="muted">{status}</span>}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
