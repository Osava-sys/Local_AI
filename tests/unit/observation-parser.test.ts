import { describe, expect, it } from 'vitest'
import {
  parseKeyValues,
  parseObservation,
  parsePorts,
  parseProcesses,
} from '../../src/renderer/src/lib/observation'

describe('renderer observation parser', () => {
  it('parses compact process observations', () => {
    const parsed = parseProcesses(
      [
        'Tasklist summary: 42 process(es).',
        'pid=4 process=System',
        'pid=8120 process=node.exe',
      ].join('\n')
    )

    expect(parsed.total).toBe(42)
    expect(parsed.rows).toEqual([
      { pid: 4, process: 'System' },
      { pid: 8120, process: 'node.exe' },
    ])
    expect(parseObservation('pid=4 process=System')).toMatchObject({ kind: 'processes' })
  })

  it('normalizes nmap and internal TCP probe rows', () => {
    const rows = parsePorts(
      ['443/tcp open https nginx 1.25', '127.0.0.1:5432/tcp closed durationMs=12'].join('\n')
    )

    expect(rows).toEqual([
      {
        port: 443,
        protocol: 'tcp',
        state: 'open',
        service: 'https',
        version: 'nginx 1.25',
      },
      {
        target: '127.0.0.1',
        port: 5432,
        protocol: 'tcp',
        state: 'closed',
        durationMs: 12,
      },
    ])
  })

  it('falls back to structured key/value rows only when enough evidence exists', () => {
    expect(parseKeyValues('Windows build: 26100\nEdition: unknown')).toEqual([
      { label: 'Windows build', value: '26100' },
      { label: 'Edition', value: 'unknown' },
    ])
    expect(parseObservation('simple observation')).toEqual({ kind: 'text' })
  })
})
