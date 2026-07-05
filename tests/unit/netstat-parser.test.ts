import { describe, it, expect } from 'vitest'
import { parseNetstatOutput, summarizeNetstatPorts } from '../../src/main/sandbox/parsers/netstat.parser'

describe('parseNetstatOutput', () => {
  it('parses Windows netstat rows and classifies exposure conservatively', () => {
    const raw = [
      'TCP    0.0.0.0:5432      0.0.0.0:0      LISTENING       8016',
      'TCP    127.0.0.1:27017   0.0.0.0:0      LISTENING       5708',
      'TCP    [::]:445          [::]:0         LISTENING       4',
    ].join('\n')

    expect(parseNetstatOutput(raw)).toEqual([
      {
        protocol: 'tcp',
        localAddress: '0.0.0.0',
        port: 5432,
        state: 'LISTENING',
        pid: 8016,
        exposure: 'all_interfaces',
      },
      {
        protocol: 'tcp',
        localAddress: '127.0.0.1',
        port: 27017,
        state: 'LISTENING',
        pid: 5708,
        exposure: 'localhost',
      },
      {
        protocol: 'tcp',
        localAddress: '::',
        port: 445,
        state: 'LISTENING',
        pid: 4,
        exposure: 'all_interfaces',
      },
    ])
  })

  it('drops non-listening TCP rows and marks private binds as LAN exposure', () => {
    const raw = [
      'TCP    192.168.1.20:8080  0.0.0.0:0      LISTENING       42',
      'TCP    127.0.0.1:5000     127.0.0.1:6000 ESTABLISHED     43',
    ].join('\n')

    expect(parseNetstatOutput(raw)).toEqual([
      {
        protocol: 'tcp',
        localAddress: '192.168.1.20',
        port: 8080,
        state: 'LISTENING',
        pid: 42,
        exposure: 'lan',
      },
    ])
  })

  it('can enrich the compact summary with tasklist process names', () => {
    const ports = parseNetstatOutput('TCP    127.0.0.1:27017   0.0.0.0:0      LISTENING       5708')
    const summary = summarizeNetstatPorts(ports, [{ imageName: 'mongod.exe', pid: 5708 }])

    expect(summary).toContain('127.0.0.1:27017')
    expect(summary).toContain('pid=5708')
    expect(summary).toContain('process=mongod.exe')
    expect(summary).toContain('exposure=localhost')
  })

  it('deduplicates repeated UDP rows before summarizing', () => {
    const ports = parseNetstatOutput(
      [
        'UDP    0.0.0.0:5353      *:*       46124',
        'UDP    0.0.0.0:5353      *:*       46124',
        'UDP    0.0.0.0:5353      *:*       18676',
      ].join('\n'),
    )

    expect(ports).toHaveLength(2)
    expect(summarizeNetstatPorts(ports)).toContain('2 unique socket')
  })

  it('prioritizes high-signal sockets and omits noisy high UDP ports from the summary', () => {
    const noisyUdp = Array.from(
      { length: 90 },
      (_, index) => `UDP    0.0.0.0:${50000 + index}      *:*       ${1000 + index}`,
    )
    const raw = [
      ...noisyUdp,
      'TCP    0.0.0.0:5432      0.0.0.0:0      LISTENING       8016',
    ].join('\n')

    const summary = summarizeNetstatPorts(parseNetstatOutput(raw))

    expect(summary).toContain('91 unique socket')
    expect(summary).toContain('0.0.0.0:5432')
    expect(summary).toContain('omitted 90 low-signal noisy socket')
    expect(summary).not.toContain('0.0.0.0:50089')
  })
})
