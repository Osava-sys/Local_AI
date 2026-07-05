import type { ToolCall } from '@shared/types/agent.types'
import type { GenericToolIntent, ShellToolIntent } from '@shared/types/sandbox.types'
import type { ZodSafeParseError } from 'zod'

export function validationErrorIntent(
  call: ToolCall,
  toolName: string,
  result: ZodSafeParseError<unknown>,
): GenericToolIntent {
  return {
    id: call.id,
    kind: 'analysis',
    payload: {
      operation: 'tool_validation_error',
      tool: toolName,
      issues: result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    risk: 'low',
  }
}

export function shellSecurityIntent(
  call: ToolCall,
  command: string,
  args: string[],
  options: {
    target: string
    timeoutMs?: number
    risk?: ShellToolIntent['risk']
    maxConnections?: number
    bindInterface?: string
    reason: string
    notes?: string[]
    requiresBinary?: string
    requiresPaths?: string[]
  },
): ShellToolIntent {
  return {
    id: call.id,
    kind: 'shell',
    command,
    args,
    timeoutMs: options.timeoutMs,
    risk: options.risk ?? 'high',
    reason: options.reason,
    networkTarget: options.target,
    maxConnections: options.maxConnections,
    bindInterface: options.bindInterface,
    notes: options.notes?.length ? options.notes : undefined,
    requiresBinary: options.requiresBinary,
    requiresPaths: options.requiresPaths?.length ? options.requiresPaths : undefined,
  }
}

export function targetFromUrl(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

export interface NormalizedHttpTarget {
  url: string
  normalized: boolean
  note?: string
}

/**
 * Rewrites HTTP targets that use a bind address (0.0.0.0 / [::]) to the matching
 * loopback address, since a bind address is never a valid request destination.
 */
export function normalizeHttpTarget(rawUrl: string): NormalizedHttpTarget {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { url: rawUrl, normalized: false }
  }

  const host = parsed.hostname
  if (host === '0.0.0.0') {
    parsed.hostname = '127.0.0.1'
    return { url: parsed.toString(), normalized: true, note: 'bind address 0.0.0.0 normalized to loopback target 127.0.0.1' }
  }
  if (host === '::' || host === '[::]') {
    parsed.hostname = '::1'
    return { url: parsed.toString(), normalized: true, note: 'bind address [::] normalized to loopback target [::1]' }
  }
  return { url: rawUrl, normalized: false }
}

export function uniqueNumbers(values: number[] | undefined): number[] | undefined {
  if (!values) return undefined
  return Array.from(new Set(values)).filter(port => Number.isInteger(port) && port >= 1 && port <= 65535)
}
