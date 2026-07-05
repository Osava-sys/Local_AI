import type { TasklistProcess } from '@shared/types/sandbox.types'

const HEADER_OR_SEPARATOR = /^(image name|nom de l'image|[-=\s]+$|\s*$)/i
const MAX_TASKLIST_SUMMARY_ROWS = 120
const HIGH_SIGNAL_PROCESS =
  /(postgres|mongod|mongo|mysql|mariadb|mssql|sqlservr|sqlbrowser|redis|node|bun|deno|python|uvicorn|gunicorn|httpd|apache|nginx|iisexpress|php-cgi|java|tomcat|docker|wsl|vmms|vmcompute|ollama|llama|lm studio|lmstudio|code|electron)/i
const SYSTEM_PROCESS = /^(system|services\.exe|svchost\.exe)$/i

export function parseTasklistOutput(raw: string): TasklistProcess[] {
  const processes: TasklistProcess[] = []

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || HEADER_OR_SEPARATOR.test(trimmed)) continue

    const csv = parseCsvTasklistLine(trimmed)
    if (csv) {
      processes.push(csv)
      continue
    }

    const match = /^(.+?)\s+(\d+)\s+/.exec(trimmed)
    if (!match) continue

    const pid = Number(match[2])
    if (!Number.isInteger(pid) || pid < 0) continue
    processes.push({ imageName: match[1].trim(), pid })
  }

  return processes
}

export function summarizeTasklistProcesses(
  processes: TasklistProcess[],
  maxRows = MAX_TASKLIST_SUMMARY_ROWS,
): string {
  if (processes.length === 0) return 'Aucun processus détecté dans la sortie tasklist.'

  const highSignal = processes.filter(process => isHighSignalProcess(process))
  const selected = (highSignal.length > 0 ? highSignal : processes)
    .slice()
    .sort((a, b) => scoreProcess(b) - scoreProcess(a) || a.pid - b.pid || a.imageName.localeCompare(b.imageName))
    .slice(0, maxRows)
  const omitted = processes.length - selected.length
  const header = [
    `Tasklist summary: ${processes.length} process(es).`,
    omitted > 0
      ? `Showing ${selected.length} high-signal process(es); omitted ${omitted} lower-signal process(es).`
      : `Showing all ${selected.length} process(es).`,
  ]
  const rows = selected.map(process => `pid=${process.pid} process=${process.imageName}`)
  return [...header, ...rows].join('\n')
}

function isHighSignalProcess(process: TasklistProcess): boolean {
  return HIGH_SIGNAL_PROCESS.test(process.imageName) || SYSTEM_PROCESS.test(process.imageName)
}

function scoreProcess(process: TasklistProcess): number {
  let score = 0
  if (HIGH_SIGNAL_PROCESS.test(process.imageName)) score += 100
  if (SYSTEM_PROCESS.test(process.imageName)) score += 50
  if (process.pid === 4) score += 20
  return score
}

function parseCsvTasklistLine(line: string): TasklistProcess | null {
  if (!line.startsWith('"')) return null

  const columns = line
    .match(/"(?:""|[^"])*"/g)
    ?.map(column => column.slice(1, -1).replace(/""/g, '"'))

  if (!columns || columns.length < 2) return null

  const pid = Number(columns[1])
  if (!Number.isInteger(pid) || pid < 0) return null

  return { imageName: columns[0], pid }
}
