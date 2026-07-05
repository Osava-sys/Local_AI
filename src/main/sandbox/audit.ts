import type { SandboxAuditRecord } from '@shared/types/audit.types'
import type { ToolIntent } from '@shared/types/sandbox.types'

/** Destination for sandbox audit records. Implementations must never throw. */
export interface SandboxAuditSink {
  record(entry: SandboxAuditRecord): void
}

/** Discards records. Used in tests and before the storage layer is wired. */
export const noopAuditSink: SandboxAuditSink = {
  record() {
    /* intentionally empty */
  },
}

/** Wraps a plain callback (e.g. a repository insert) as a fail-safe audit sink. */
export function createAuditSink(write: (entry: SandboxAuditRecord) => void): SandboxAuditSink {
  return {
    record(entry) {
      try {
        write(entry)
      } catch {
        // Auditing must never break execution; swallow storage failures.
      }
    },
  }
}

/** Collapses whitespace and truncates so audit rows stay bounded and log-safe. */
export function truncateForAudit(text: string, max = 500): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/** Produces a secret-free, human-readable one-line summary of an intent. */
export function summarizeIntent(intent: ToolIntent): string {
  switch (intent.kind) {
    case 'shell':
      return truncateForAudit(`${intent.command} ${(intent.args ?? []).join(' ')}`)
    case 'network':
      return truncateForAudit(`${intent.scanType ?? 'scan'} ${intent.target} ${(intent.ports ?? []).join(',')}`)
    case 'filesystem':
      return truncateForAudit(`${intent.mode} ${intent.path}`)
    case 'browser':
      return truncateForAudit(`${intent.action} ${intent.url}`)
    default:
      return truncateForAudit(`${intent.kind}`)
  }
}
