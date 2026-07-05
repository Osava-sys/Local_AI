import { isAbsolute, relative, resolve } from 'path'
import type { SandboxPolicy } from '@shared/types/sandbox.types'
import { loadSandboxPolicy, resolveWorkspaceRoot } from './policy-loader'

export interface ScopeCheck {
  ok: boolean
  resolvedPath: string
  reason?: string
}

/** Sensitive locations that are never in scope, even if the workspace root is misconfigured. */
const SENSITIVE_PREFIXES = [
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
  '/etc',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/boot',
  '/sys',
  '/proc',
  '/dev',
  '/root',
  '/var/run',
]

/**
 * Validates that a filesystem path stays inside the configured workspace root
 * and never touches a sensitive system location. Path traversal (../) is
 * neutralised by resolving before comparison.
 */
export class FilesystemScope {
  readonly root: string

  constructor(policy: SandboxPolicy = loadSandboxPolicy(), root: string = resolveWorkspaceRoot(policy)) {
    this.root = resolve(root)
  }

  check(inputPath: string): ScopeCheck {
    const resolved = isAbsolute(inputPath) ? resolve(inputPath) : resolve(this.root, inputPath)

    if (isSensitive(resolved)) {
      return { ok: false, resolvedPath: resolved, reason: `Refused sensitive system path: ${resolved}` }
    }

    const rel = relative(this.root, resolved)
    if (rel === '' ) return { ok: true, resolvedPath: resolved }
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return { ok: false, resolvedPath: resolved, reason: `Path escapes the workspace root: ${resolved}` }
    }

    return { ok: true, resolvedPath: resolved }
  }

  /** Depth of a resolved path relative to the workspace root (root itself is depth 0). */
  depthFromRoot(resolvedPath: string): number {
    const rel = relative(this.root, resolvedPath)
    if (!rel || rel === '.') return 0
    return rel.split(/[\\/]/).filter(Boolean).length
  }
}

function isSensitive(resolvedPath: string): boolean {
  const normalized = resolvedPath.toLowerCase().replace(/\\/g, '\\')
  return SENSITIVE_PREFIXES.some(prefix => {
    const p = prefix.toLowerCase()
    return normalized === p || normalized.startsWith(p + (p.includes('\\') ? '\\' : '/'))
  })
}
