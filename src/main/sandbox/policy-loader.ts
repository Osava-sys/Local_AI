import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { SandboxPolicy } from '@shared/types/sandbox.types'
import { DEFAULT_SANDBOX_POLICY, normalizeSandboxPolicy } from './policy'

let cached: SandboxPolicy | null = null

/** Loads and caches config/sandbox/policy.json, falling back to safe defaults. */
export function loadSandboxPolicy(force = false): SandboxPolicy {
  if (cached && !force) return cached
  try {
    const filePath = resolve(process.cwd(), 'config', 'sandbox', 'policy.json')
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<SandboxPolicy>
    cached = normalizeSandboxPolicy(parsed)
  } catch {
    cached = DEFAULT_SANDBOX_POLICY
  }
  return cached
}

/** Absolute path of the workspace root the sandbox is allowed to touch. */
export function resolveWorkspaceRoot(policy: SandboxPolicy = loadSandboxPolicy()): string {
  return resolve(process.cwd(), policy.workspaceRoot || '.')
}
