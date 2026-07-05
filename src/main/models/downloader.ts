import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { basename, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { WebContents } from 'electron'
import type { LocalModelRecord, ModelDownloadProgress, ModelDownloadRequest } from '@shared/types/model.types'
import { LocalModelRegistry } from './registry'

function safeFilename(input: string): string {
  const filename = basename(input.split('?')[0]).replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!filename.toLowerCase().endsWith('.gguf')) {
    throw new Error('Only direct .gguf download URLs are supported.')
  }
  return filename
}

export class ModelDownloader {
  constructor(
    private readonly registry: LocalModelRegistry,
    private readonly modelsDir: string,
    private readonly webContents?: WebContents,
  ) {}

  async download(request: ModelDownloadRequest): Promise<LocalModelRecord> {
    await mkdir(this.modelsDir, { recursive: true })

    const id = crypto.randomUUID()
    const filename = request.filename ? safeFilename(request.filename) : safeFilename(request.url)
    const targetPath = join(this.modelsDir, filename)
    const response = await fetch(request.url)

    if (!response.ok || !response.body) {
      throw new Error(`Download failed with HTTP ${response.status}`)
    }

    const totalBytes = Number(response.headers.get('content-length')) || null
    let downloadedBytes = 0

    this.emit({
      id,
      url: request.url,
      filename,
      downloadedBytes,
      totalBytes,
      percent: null,
      status: 'downloading',
    })

    const progressStream = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        downloadedBytes += chunk.byteLength
        this.emit({
          id,
          url: request.url,
          filename,
          downloadedBytes,
          totalBytes,
          percent: totalBytes ? Math.round((downloadedBytes / totalBytes) * 1000) / 10 : null,
          status: 'downloading',
        })
        controller.enqueue(chunk)
      },
    })

    await pipeline(
      Readable.fromWeb(response.body.pipeThrough(progressStream) as ReadableStream<Uint8Array>),
      createWriteStream(targetPath),
    )

    this.emit({
      id,
      url: request.url,
      filename,
      downloadedBytes,
      totalBytes,
      percent: 100,
      status: 'completed',
    })

    return this.registry.registerLocal(targetPath, request.name, request.url)
  }

  private emit(progress: ModelDownloadProgress): void {
    this.webContents?.send('model:downloadProgress', progress)
  }
}
