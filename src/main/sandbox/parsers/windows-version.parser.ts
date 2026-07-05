export interface WindowsVersionObservation {
  raw: string
  kernelVersion: string | null
  build: number | null
  productName: string | null
  edition: string | null
}

const CMD_VER_RE = /Microsoft Windows \[version\s+([^\]]+)\]/i

export function parseWindowsVersionOutput(raw: string): WindowsVersionObservation {
  const trimmed = raw.trim()
  const kernelVersion = CMD_VER_RE.exec(trimmed)?.[1]?.trim() ?? null
  const build = kernelVersion ? Number(kernelVersion.split('.')[2]) : null

  return {
    raw: trimmed,
    kernelVersion,
    build: Number.isInteger(build) ? build : null,
    productName: null,
    edition: null,
  }
}

export function summarizeWindowsVersion(observation: WindowsVersionObservation): string {
  const lines = ['OS observation source: cmd /c ver']

  if (observation.kernelVersion) {
    lines.push(`Windows NT kernel version: ${observation.kernelVersion}`)
  } else {
    lines.push(`Raw output: ${observation.raw || '(empty)'}`)
  }

  if (observation.build !== null) lines.push(`Windows build: ${observation.build}`)
  lines.push('Product name: unknown from this command')
  lines.push('Edition: unknown from this command')
  lines.push('Do not infer Windows 10/11 or Pro/Home from cmd /c ver alone.')

  return lines.join('\n')
}
