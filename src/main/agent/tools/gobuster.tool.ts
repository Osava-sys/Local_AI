import * as z from 'zod'
import type { AgentTool } from './tool'
import { classifyTarget } from '../../sandbox/network-scope'
import { normalizeHttpTarget, shellSecurityIntent, targetFromUrl, validationErrorIntent } from './security-tool-helpers'

const GobusterArgsSchema = z.object({
  mode: z.enum(['dir', 'dns', 'vhost']).default('dir'),
  url: z.string().min(1).max(2048),
  wordlist: z.string().min(1).max(1024),
  extensions: z.array(z.string().regex(/^[A-Za-z0-9]+$/)).max(20).optional(),
  threads: z.number().int().min(1).max(64).default(10),
  statusCodes: z.array(z.number().int().min(100).max(599)).max(30).optional(),
  timeoutMs: z.number().int().positive().optional(),
})

const SCOPE_LABEL: Record<string, string> = {
  loopback: 'localhost',
  private: 'LAN',
  external: 'external',
}

export const gobusterTool: AgentTool = {
  name: 'gobuster.tool.ts',
  description: 'Structured Gobuster web/DNS enumeration intent with bounded threads and explicit wordlist.',
  createIntent(args, call) {
    const parsed = GobusterArgsSchema.safeParse(args)
    if (!parsed.success) return validationErrorIntent(call, 'gobuster.tool.ts', parsed)

    const { url, normalized, note } = normalizeHttpTarget(parsed.data.url)
    const host = targetFromUrl(url)
    const scope = SCOPE_LABEL[classifyTarget(host)] ?? 'unknown'

    const commandArgs = [
      parsed.data.mode,
      '-u',
      url,
      '-w',
      parsed.data.wordlist,
      '-t',
      String(parsed.data.threads),
      '--no-error',
      ...(parsed.data.extensions?.length ? ['-x', parsed.data.extensions.join(',')] : []),
      ...(parsed.data.statusCodes?.length ? ['-s', parsed.data.statusCodes.join(',')] : []),
    ]

    const reason = [
      `Active ${scope} web enumeration (gobuster ${parsed.data.mode}) against ${url}`,
      `wordlist=${parsed.data.wordlist}`,
      `threads=${parsed.data.threads}`,
      normalized ? `(${note})` : '',
      'Impact: many HTTP requests probing hidden paths/vhosts on the target.',
    ]
      .filter(Boolean)
      .join(' — ')

    return shellSecurityIntent(call, 'gobuster', commandArgs, {
      target: host,
      timeoutMs: parsed.data.timeoutMs,
      risk: 'high',
      maxConnections: parsed.data.threads,
      reason,
      notes: note ? [note] : undefined,
      requiresBinary: 'gobuster',
      requiresPaths: [parsed.data.wordlist],
    })
  },
}
