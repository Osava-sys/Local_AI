import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync, statSync } from 'fs'
import { createServer } from 'net'
import { basename, dirname, join } from 'path'
import type { WebContents } from 'electron'
import type { LocalModelRecord, ModelConfigInput, ModelLoadOptions, ModelRuntimeStatus } from '@shared/types/model.types'
import { defaultLlamaServerCandidates } from './resources'
import { resolveMmprojPath } from './mmproj'

let activeRuntimeConfig: ModelConfigInput | null = null

export function getActiveRuntimeModelConfig(): ModelConfigInput | null {
  return activeRuntimeConfig
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Returns the first free TCP port at or after `preferred` on `host`.
 * Avoids collisions with other servers already bound to the default port
 * (e.g. Apache/XAMPP on 8080), which otherwise makes llama.cpp fail to bind
 * while the readiness probe hits the foreign server and times out.
 */
function findFreePort(preferred: number, host: string, attempts = 20): Promise<number> {
  return new Promise(resolve => {
    const tryPort = (port: number, left: number): void => {
      const tester = createServer()
      tester.once('error', () => {
        tester.close()
        if (left <= 0) resolve(preferred)
        else tryPort(port + 1, left - 1)
      })
      tester.once('listening', () => {
        tester.close(() => resolve(port))
      })
      tester.listen(port, host)
    }
    tryPort(preferred, attempts)
  })
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
    let port = options.port ?? 8080
    let executable: string
    try {
      executable = this.resolveExecutable(options.executablePath)
    } catch (error) {
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

    // Pick a free port so we never collide with a server already on the default
    // (the endpoint below is built from the resolved port, so callers stay in sync).
    port = await findFreePort(port, host)

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

    // Recent llama.cpp builds require a value for --flash-attn (on|off|auto);
    // passing the bare flag makes it swallow the next arg (e.g. --mmproj).
    if (options.flashAttention) args.push('--flash-attn', 'on')

    // Load a multimodal projector so the model can accept images (vision),
    // the way LM Studio pairs the model with its mmproj. Explicit path wins;
    // otherwise auto-detect an mmproj*.gguf sitting next to the model.
    const mmprojPath = resolveMmprojPath(model.path, options.mmprojPath)
    if (mmprojPath) {
      args.push('--mmproj', mmprojPath)
      console.log(`[runtime] multimodal projector: ${mmprojPath}`)
    }

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
      const spawnError = new Promise<never>((_, reject) => {
        this.process?.once('error', error => {
          reject(new Error(`Unable to start llama.cpp server at "${executable}": ${error.message}`))
        })
      })

      // Fail fast if the server dies during startup (bad args, port bind, OOM)
      // instead of waiting out the full readiness timeout.
      let ready = false
      const earlyExit = new Promise<never>((_, reject) => {
        this.process?.once('exit', code => {
          if (!ready) reject(new Error(`llama.cpp server exited before becoming ready (code ${code}). ${logs.trim()}`))
        })
      })

      this.process.on('exit', code => {
        if (this.status.state === 'running' || this.status.state === 'starting') {
          this.status = { ...this.status, state: 'error', error: `llama.cpp exited with code ${code}. ${logs}` }
          activeRuntimeConfig = null
          this.emit()
        }
      })

      await Promise.race([
        this.waitForServer(`http://${host}:${port}`, 60000),
        spawnError,
        earlyExit,
      ])
      ready = true

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
      if (!statSync(explicitPath).isFile()) throw new Error(`llama.cpp server path is not a file: ${explicitPath}`)

      // The llama.cpp bundle ships many .exe (ggml-rpc-server, llama-cli, …).
      // Only llama-server is the HTTP server that accepts -m/--host/--port;
      // the others reject "-m" and exit. If the user picked the wrong one,
      // recover llama-server from the same folder instead of failing.
      const name = basename(explicitPath).toLowerCase()
      if (name.startsWith('llama-server')) return explicitPath

      const serverBinary = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
      const sibling = join(dirname(explicitPath), serverBinary)
      if (existsSync(sibling)) {
        console.log(`[runtime] "${basename(explicitPath)}" is not the HTTP server; using ${sibling} instead.`)
        return sibling
      }

      throw new Error(
        `"${basename(explicitPath)}" is not the llama.cpp HTTP server. Select "${serverBinary}" (it sits in the same llama.cpp folder).`,
      )
    }

    for (const candidate of defaultLlamaServerCandidates(this.appPath)) {
      if (existsSync(candidate)) return candidate
    }

    throw new Error(
      'llama.cpp server executable not found. Put llama-server.exe in resources/bin/llama-cpp, set LLAMA_CPP_SERVER_PATH, or paste the full path to llama-server.exe in the UI.',
    )
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
