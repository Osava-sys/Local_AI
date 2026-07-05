import { Socket } from 'net'
import type { TcpPortProbeResult } from '@shared/types/sandbox.types'

export interface TcpPortProbeInput {
  target: string
  ports: number[]
  timeoutMs: number
}

export class TcpPortProber {
  async probe(input: TcpPortProbeInput): Promise<TcpPortProbeResult[]> {
    const host = extractHost(input.target)
    const ports = input.ports.filter(port => Number.isInteger(port) && port >= 1 && port <= 65535)
    return Promise.all(ports.map(port => probeOne(host, port, input.timeoutMs)))
  }
}

function probeOne(host: string, port: number, timeoutMs: number): Promise<TcpPortProbeResult> {
  const started = Date.now()
  const timeout = Math.max(1, timeoutMs)

  return new Promise(resolve => {
    const socket = new Socket()
    let settled = false

    const finish = (status: TcpPortProbeResult['status']): void => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve({ port, status, durationMs: Date.now() - started })
    }

    socket.setTimeout(timeout)
    socket.once('connect', () => finish('open'))
    socket.once('timeout', () => finish('timeout'))
    socket.once('error', () => finish('closed'))
    socket.connect({ host, port })
  })
}

function extractHost(target: string): string {
  const trimmed = target.trim()
  if (!trimmed) return '127.0.0.1'

  try {
    if (trimmed.includes('://')) return new URL(trimmed).hostname
  } catch {
    // Fall through to conservative string parsing.
  }

  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end > 0) return trimmed.slice(1, end)
  }

  const withoutPath = trimmed.split('/')[0]
  const colonCount = (withoutPath.match(/:/g) ?? []).length
  if (colonCount === 1) return withoutPath.split(':')[0]
  return withoutPath
}
