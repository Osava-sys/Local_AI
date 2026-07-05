import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { SandboxLimits } from '@shared/types/sandbox.types'

export const DEFAULT_LIMITS: SandboxLimits = {
  defaultTimeoutMs: 30000,
  httpRequestTimeoutMs: 30000,
  networkScanTimeoutMs: 300000,
  maxTimeoutMs: 300000,
  maxOutputBytes: 1_048_576,
  maxFileSizeMB: 10,
  maxDirectoryDepth: 5,
  approvalTimeoutMs: 300000,
}

let cached: SandboxLimits | null = null

/** Loads and caches config/sandbox/limits.json, falling back to safe defaults. */
export function loadLimits(force = false): SandboxLimits {
  if (cached && !force) return cached
  try {
    const filePath = resolve(process.cwd(), 'config', 'sandbox', 'limits.json')
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<SandboxLimits>
    cached = normalizeLimits({ ...DEFAULT_LIMITS, ...parsed })
  } catch {
    cached = DEFAULT_LIMITS
  }
  return cached
}

/** Replaces any missing/non-positive limit with its default. */
export function normalizeLimits(limits: SandboxLimits): SandboxLimits {
  return {
    defaultTimeoutMs: positiveOr(limits.defaultTimeoutMs, DEFAULT_LIMITS.defaultTimeoutMs),
    httpRequestTimeoutMs: positiveOr(limits.httpRequestTimeoutMs, DEFAULT_LIMITS.httpRequestTimeoutMs),
    networkScanTimeoutMs: positiveOr(limits.networkScanTimeoutMs, DEFAULT_LIMITS.networkScanTimeoutMs),
    maxTimeoutMs: positiveOr(limits.maxTimeoutMs, DEFAULT_LIMITS.maxTimeoutMs),
    maxOutputBytes: positiveOr(limits.maxOutputBytes, DEFAULT_LIMITS.maxOutputBytes),
    maxFileSizeMB: positiveOr(limits.maxFileSizeMB, DEFAULT_LIMITS.maxFileSizeMB),
    maxDirectoryDepth: positiveOr(limits.maxDirectoryDepth, DEFAULT_LIMITS.maxDirectoryDepth),
    approvalTimeoutMs: positiveOr(limits.approvalTimeoutMs, DEFAULT_LIMITS.approvalTimeoutMs),
  }
}

/** Clamps a requested timeout into [1, maxTimeoutMs], defaulting when unset. */
export function resolveTimeout(requested: number | undefined, limits: SandboxLimits = loadLimits()): number {
  const value = requested ?? limits.defaultTimeoutMs
  if (!Number.isFinite(value) || value <= 0) return limits.defaultTimeoutMs
  return Math.min(value, limits.maxTimeoutMs)
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}
