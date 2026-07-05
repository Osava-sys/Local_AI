import { existsSync } from 'fs'
import { delimiter, join } from 'path'

export interface ToolAvailability {
  name: string
  available: boolean
  path?: string
  source: 'configured' | 'path' | 'missing'
}

/** System security tools whose availability shapes what the agent may attempt. */
export const SECURITY_TOOLS = ['nmap', 'gobuster', 'sqlmap', 'curl', 'powershell'] as const

const cache = new Map<string, ToolAvailability>()
const forcedUnavailable = new Set<string>()

/** Resolves a tool by configured path first, then by scanning PATH (with PATHEXT on Windows). */
export function resolveExecutable(name: string, configuredPath?: string): ToolAvailability {
  const key = name.toLowerCase()
  if (forcedUnavailable.has(key)) return { name, available: false, source: 'missing' }
  if (configuredPath && existsSync(configuredPath)) {
    return { name, available: true, path: configuredPath, source: 'configured' }
  }
  const found = searchPath(name)
  return found ? { name, available: true, path: found, source: 'path' } : { name, available: false, source: 'missing' }
}

/** Cached availability lookup. Pass `force` to bypass the cache. */
export function detectTool(name: string, configuredPath?: string, force = false): ToolAvailability {
  const key = name.toLowerCase()
  if (!force && cache.has(key)) return cache.get(key) as ToolAvailability
  const result = resolveExecutable(name, configuredPath)
  cache.set(key, result)
  return result
}

export function detectTools(
  names: readonly string[] = SECURITY_TOOLS,
  configured: Record<string, string> = {},
): ToolAvailability[] {
  return names.map(name => detectTool(name, configured[name]))
}

export function isToolAvailable(name: string): boolean {
  return detectTool(name).available
}

/**
 * Remembers that a tool is unavailable after a real command-not-found failure,
 * so later prompts stop offering it and the agent will not retry it this run.
 */
export function markToolUnavailable(name: string): void {
  const key = name.toLowerCase()
  forcedUnavailable.add(key)
  cache.set(key, { name, available: false, source: 'missing' })
}

/** Test/reset hook. */
export function resetToolAvailabilityCache(): void {
  cache.clear()
  forcedUnavailable.clear()
}

function searchPath(name: string): string | undefined {
  const pathVar = process.env['PATH'] ?? process.env['Path'] ?? ''
  const extensions =
    process.platform === 'win32'
      ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
      : ['']

  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue
    for (const ext of extensions) {
      const candidate = join(dir, `${name}${ext}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}
