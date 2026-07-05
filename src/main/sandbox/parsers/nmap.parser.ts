import type { NmapPort } from '@shared/types/sandbox.types'

// Matches the canonical nmap port table line:  "22/tcp   open  ssh  OpenSSH 9.6"
// Groups: port, protocol, state, service?, version(rest)?
const PORT_LINE = /^(\d{1,5})\/(tcp|udp)\s+(\S+)(?:\s+(\S+))?\s*(.*)$/i

/**
 * Parses nmap textual output into structured port rows. Non-port lines
 * (banners, "Nmap scan report", "Host is up", column headers) are ignored.
 */
export function parseNmapOutput(raw: string): NmapPort[] {
  const ports: NmapPort[] = []

  for (const line of raw.split(/\r?\n/)) {
    const match = PORT_LINE.exec(line.trim())
    if (!match) continue

    const port = Number(match[1])
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue

    ports.push({
      port,
      protocol: match[2].toLowerCase() as 'tcp' | 'udp',
      state: (match[3] ?? '').toLowerCase(),
      service: match[4] ?? '',
      version: (match[5] ?? '').trim(),
    })
  }

  return ports
}
