const MAX_BODY_PREVIEW_CHARS = 1200
const MAX_HEADER_ROWS = 30

export function summarizeCurlOutput(stdout = '', stderr = ''): string {
  const stdoutText = stdout.trim()
  const stderrText = stderr.trim()
  const verboseLines = stderrText.split(/\r?\n/).map(stripCurlVerbosePrefix).filter(Boolean)
  const stdoutLines = stdoutText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const headerLikeStdout = stdoutLines.some(line => /^HTTP\/\d(?:\.\d)?\s+\d{3}\b/i.test(line))
  const responseLines = headerLikeStdout ? [...verboseLines, ...stdoutLines] : verboseLines
  const statusLines = responseLines.filter(line => /^HTTP\/\d(?:\.\d)?\s+\d{3}\b/i.test(line))
  const headers = responseLines
    .filter(line => /^[A-Za-z0-9-]+:\s+/.test(line))
    .slice(0, MAX_HEADER_ROWS)

  const lines = ['Curl HTTP summary:']
  if (statusLines.length > 0) lines.push(`Status: ${statusLines.at(-1)}`)
  if (headers.length > 0) {
    lines.push('Headers:')
    lines.push(...headers.map(header => `- ${header}`))
  }

  if (stdoutText && !headerLikeStdout) {
    lines.push(`Body preview (${stdoutText.length} chars):`)
    lines.push(truncate(stdoutText, MAX_BODY_PREVIEW_CHARS))
  }

  if (!stdoutText && stderrText && statusLines.length === 0) {
    lines.push('Diagnostics:')
    lines.push(truncate(stderrText, MAX_BODY_PREVIEW_CHARS))
  }

  if (lines.length === 1) lines.push('Command completed without HTTP status, headers, or body output.')
  return lines.join('\n')
}

function stripCurlVerbosePrefix(line: string): string {
  return line.trim().replace(/^[<>\*]\s*/, '').trim()
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`
}
