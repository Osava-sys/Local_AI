import { describe, it, expect } from 'vitest'
import { parseNmapOutput } from '../../src/main/sandbox/parsers/nmap.parser'

describe('parseNmapOutput', () => {
  it('parses the canonical port table into structured rows', () => {
    const raw = ['22/tcp open ssh OpenSSH 9.6', '80/tcp open http nginx 1.24', '443/tcp closed https'].join('\n')

    expect(parseNmapOutput(raw)).toEqual([
      { port: 22, protocol: 'tcp', state: 'open', service: 'ssh', version: 'OpenSSH 9.6' },
      { port: 80, protocol: 'tcp', state: 'open', service: 'http', version: 'nginx 1.24' },
      { port: 443, protocol: 'tcp', state: 'closed', service: 'https', version: '' },
    ])
  })

  it('ignores banners, headers, and blank lines from real nmap output', () => {
    const raw = [
      'Starting Nmap 7.94 ( https://nmap.org )',
      'Nmap scan report for localhost (127.0.0.1)',
      'Host is up (0.00010s latency).',
      'PORT   STATE SERVICE VERSION',
      '53/udp open domain dnsmasq 2.90',
      '',
      'Nmap done: 1 IP address (1 host up) scanned in 1.20 seconds',
    ].join('\n')

    expect(parseNmapOutput(raw)).toEqual([
      { port: 53, protocol: 'udp', state: 'open', service: 'domain', version: 'dnsmasq 2.90' },
    ])
  })

  it('drops out-of-range ports and returns [] for empty input', () => {
    expect(parseNmapOutput('')).toEqual([])
    expect(parseNmapOutput('70000/tcp open weird')).toEqual([])
  })
})
