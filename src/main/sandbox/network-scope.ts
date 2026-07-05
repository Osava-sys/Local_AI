import { isIP } from 'net'

export type TargetScope = 'loopback' | 'private' | 'external'

/**
 * Classifies a scan target into loopback, RFC1918 private, or external.
 * Accepts bare hosts, IPs, and URLs (scheme/port/path are stripped).
 */
export function classifyTarget(target: string): TargetScope {
  const host = extractHost(target)
  const lower = host.toLowerCase()
  if (lower === 'localhost' || lower === '::1' || lower.startsWith('127.')) return 'loopback'
  if (isIP(lower) === 4 && isPrivateIpv4(lower)) return 'private'
  return 'external'
}

/** A target is "local" when it is loopback or on a private (RFC1918) range. */
export function isLocalTarget(target: string): boolean {
  const scope = classifyTarget(target)
  return scope === 'loopback' || scope === 'private'
}

function extractHost(target: string): string {
  let value = target.trim()
  const schemeIndex = value.indexOf('://')
  if (schemeIndex !== -1) value = value.slice(schemeIndex + 3)
  value = value.split('/')[0]
  // Strip a trailing :port only when the remainder is not a bare IPv6 address.
  if (isIP(value) === 0 && value.includes(':') && !value.includes(']')) {
    value = value.split(':')[0]
  }
  return value.replace(/^\[|\]$/g, '')
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return false
  const [a, b] = parts
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}
