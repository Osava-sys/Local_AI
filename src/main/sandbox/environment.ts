/**
 * Environment allowlist for sandboxed child processes. Only these keys are
 * inherited from the host; everything else (tokens, cloud creds, custom
 * variables) is dropped so a spawned tool cannot read ambient secrets.
 */
const ALLOWED_ENV_KEYS = [
  'PATH',
  'PATHEXT',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'USERPROFILE',
  'SystemRoot',
  'SystemDrive',
  'windir',
  'ComSpec',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TZ',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
]

const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Builds a minimal env from the host allowlist plus explicitly provided, sanitised extras. */
export function buildMinimalEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}

  for (const key of ALLOWED_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }

  for (const [key, value] of Object.entries(extra)) {
    if (VALID_KEY.test(key) && typeof value === 'string') env[key] = value
  }

  return env
}
