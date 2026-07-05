import { describe, expect, it } from 'vitest'
import { parserTool } from '../../src/main/agent/tools/parser.tool'
import { SandboxExecutor } from '../../src/main/sandbox/sandbox-executor'

describe('parser.tool.ts', () => {
  it('extracts structured entities from raw security logs inside the sandbox', async () => {
    const intent = parserTool.createIntent(
      {
        source: 'nmap',
        text: [
          'Nmap scan report for 192.168.1.5',
          '22/tcp open ssh OpenSSH 9.6',
          'CVE-2024-12345 possible SQL injection user=admin process=sshd.exe',
        ].join('\n'),
      },
      { id: 'p', name: 'parser.tool.ts', args: {}, status: 'pending' },
    )

    const result = await new SandboxExecutor().execute(intent)

    expect(result.status).toBe('success')
    expect(result.observation).toContain('192.168.1.5')
    expect(result.observation).toContain('22/tcp open ssh')
    expect(result.observation).toContain('CVE-2024-12345')
    expect(result.metadata).toMatchObject({
      parsedSecurityLog: {
        ips: ['192.168.1.5'],
        cves: ['CVE-2024-12345'],
        users: ['admin'],
        processes: ['sshd.exe'],
      },
    })
  })
})
