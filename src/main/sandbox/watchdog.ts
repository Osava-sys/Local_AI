import type { SandboxLimits, ToolIntent } from '@shared/types/sandbox.types'
import { loadLimits, resolveTimeout } from './limits'

const HTTP_COMMANDS = new Set(['curl', 'wget', 'httpie', 'http'])
const SECURITY_SCAN_COMMANDS = new Set(['nmap', 'gobuster', 'sqlmap', 'burpsuite-cli', 'burpsuite'])

export function resolveWatchdogTimeout(
  intent: ToolIntent,
  limits: SandboxLimits = loadLimits()
): number {
  if (intent.timeoutMs !== undefined) return resolveTimeout(intent.timeoutMs, limits)
  if (intent.kind === 'network') return resolveTimeout(limits.networkScanTimeoutMs, limits)

  if (intent.kind === 'shell') {
    const command = baseCommand(intent.command)
    if (HTTP_COMMANDS.has(command)) return resolveTimeout(limits.httpRequestTimeoutMs, limits)
    if (SECURITY_SCAN_COMMANDS.has(command))
      return resolveTimeout(limits.networkScanTimeoutMs, limits)
  }

  return resolveTimeout(undefined, limits)
}

export function watchdogTimeoutObservation(timeoutMs: number): string {
  return `Watchdog: execution timed out after ${timeoutMs}ms. The task was stopped cleanly. Fallback: reduce the target/port scope or retry with a bounded longer timeout if still authorized.`
}

function baseCommand(command: string): string {
  return (command.split(/[\\/]/).pop() ?? command).toLowerCase().replace(/\.exe$/, '')
}
