import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { basename } from 'path'
import type { WebContents } from 'electron'
import type { LocalModelRecord, ModelConfigInput, ModelLoadOptions, ModelRuntimeStatus } from '@shared/types/model.types'
import { defaultLlamaServerCandidates } from './resources'

let activeRuntimeConfig: ModelConfigInput | null = null

export function getActiveRuntimeModelConfig(): ModelConfigInput | null {
  return activeRuntimeConfig
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class LlamaCppRuntime {
  private process: ChildProcessWithoutNullStreams | null = null
  private status: ModelRuntimeStatus = {
    state: 'idle',
    device: null,
    loadedModelId: null,
    modelName: null,
    endpoint: null,
    pid: null,
    error: null,
    startedAt: null,
  }

  constructor(
    private readonly appPath: string,
    private readonly webContents?: WebContents,
  ) {}

  getStatus(): ModelRuntimeStatus {
    return this.status
  }

  async load(model: LocalModelRecord, options: ModelLoadOptions): Promise<ModelRuntimeStatus> {
    await this.unload()

    const host = options.host ?? '127.0.0.1'
    const port = options.port ?? 8080
    const executable = this.resolveExecutable(options.executablePath)
    const gpuLayers = options.device === 'gpu' ? options.gpuLayers ?? 35 : 0
    const contextLength = options.contextLength ?? 32768
    const threads = options.threads ?? 8
    const batchSize = options.batchSize ?? 512

    const args = [
      '-m', model.path,
      '--host', host,
      '--port', String(port),
      '--ctx-size', String(contextLength),
      '--threads', String(threads),
      '--batch-size', String(batchSize),
      '--n-gpu-layers', String(gpuLayers),
    ]

    if (options.flashAttention) args.push('--flash-attn')

    this.status = {
      state: 'starting',
      device: options.device,
      loadedModelId: model.id,
      modelName: model.name,
      endpoint: `http://${host}:${port}/v1/chat/completions`,
      pid: null,
      error: null,
      startedAt: new Date().toISOString(),
    }
    this.emit()

    try {
      this.process = spawn(executable, args, {
        shell: false,
        windowsHide: true,
      })

      this.status = { ...this.status, pid: this.process.pid ?? null }
      this.emit()

      let logs = ''
      this.process.stderr.on('data', chunk => {
        logs = `${logs}${String(chunk)}`.slice(-8000)
      })
      this.process.stdout.on('data', chunk => {
        logs = `${logs}${String(chunk)}`.slice(-8000)
      })
      this.process.on('exit', code => {
        if (this.status.state === 'running' || this.status.state === 'starting') {
          this.status = { ...this.status, state: 'error', error: `llama.cpp exited with code ${code}. ${logs}` }
          activeRuntimeConfig = null
          this.emit()
        }
      })

      await this.waitForServer(`http://${host}:${port}`, 60000)

      activeRuntimeConfig = {
        host: this.status.endpoint!,
        modelName: basename(model.path),
        modelPath: model.path,
        contextLength,
        gpuLayers,
        nThreads: threads,
        nBatch: batchSize,
        streamEnabled: true,
        useCache: true,
        maxTokensPerTurn: 2048,
        timeoutMs: 60000,
        maxRetries: 1,
      }

      this.status = { ...this.status, state: 'running', error: null }
      this.emit()
      return this.status
    } catch (error) {
      await this.unload()
      this.status = {
        state: 'error',
        device: options.device,
        loadedModelId: model.id,
        modelName: model.name,
        endpoint: `http://${host}:${port}/v1/chat/completions`,
        pid: null,
        error: error instanceof Error ? error.message : String(error),
        startedAt: new Date().toISOString(),
      }
      this.emit()
      return this.status
    }
  }

  async unload(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    activeRuntimeConfig = null
    this.status = {
      state: 'idle',
      device: null,
      loadedModelId: null,
      modelName: null,
      endpoint: null,
      pid: null,
      error: null,
      startedAt: null,
    }
    this.emit()
  }

  private resolveExecutable(explicitPath?: string): string {
    if (explicitPath) {
      if (!existsSync(explicitPath)) throw new Error(`llama.cpp server executable not found: ${explicitPath}`)
      return explicitPath
    }

    for (const candidate of defaultLlamaServerCandidates(this.appPath)) {
      if (candidate === 'llama-server') return candidate
      if (candidate === 'llama-server.exe') return candidate
      if (existsSync(candidate)) return candidate
    }

    throw new Error('llama.cpp server executable not found. Put llama-server.exe in resources/bin/llama-cpp or set LLAMA_CPP_SERVER_PATH.')
  }

  private async waitForServer(baseUrl: string, timeoutMs: number): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      try {
        const response = await fetch(`${baseUrl}/v1/models`)
        if (response.ok) return
      } catch {
        // Server is still starting.
      }
      await sleep(750)
    }
    throw new Error(`llama.cpp server did not become ready after ${timeoutMs}ms.`)
  }

  private emit(): void {
    this.webContents?.send('model:runtimeState', this.status)
  }
}
