import { describe, expect, it } from 'vitest'
import { summarizeCurlOutput } from '../../src/main/sandbox/parsers/curl.parser'

describe('summarizeCurlOutput', () => {
  it('keeps verbose HTTP status and headers from stderr with a body preview from stdout', () => {
    const stderr = [
      '* Connected to 127.0.0.1',
      '< HTTP/1.1 200 OK',
      '< Server: Apache',
      '< Content-Type: text/html',
    ].join('\n')

    const summary = summarizeCurlOutput('<html>ok</html>', stderr)

    expect(summary).toContain('Status: HTTP/1.1 200 OK')
    expect(summary).toContain('- Server: Apache')
    expect(summary).toContain('Body preview')
    expect(summary).toContain('<html>ok</html>')
  })

  it('surfaces diagnostics when curl produced no HTTP response', () => {
    const summary = summarizeCurlOutput('', 'curl: (7) Failed to connect')

    expect(summary).toContain('Diagnostics:')
    expect(summary).toContain('Failed to connect')
  })

  it('treats header-only stdout as HTTP status and headers', () => {
    const stdout = [
      'HTTP/1.1 200 OK',
      'Date: Sun, 05 Jul 2026 20:17:11 GMT',
      'Server: Apache',
      'Content-Type: text/html',
    ].join('\n')

    const summary = summarizeCurlOutput(stdout, '')

    expect(summary).toContain('Status: HTTP/1.1 200 OK')
    expect(summary).toContain('- Server: Apache')
    expect(summary).not.toContain('Body preview')
  })
})
