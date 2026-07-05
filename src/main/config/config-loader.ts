import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import { AppConfigSchema, type AppConfig } from '@shared/validation/settings.schema'

function loadYaml(filePath: string): unknown {
  try {
    return parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof result[k] === 'object' && result[k] !== null) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      result[k] = v
    }
  }
  return result
}

let _config: AppConfig | null = null

export function loadConfig(configDir: string): AppConfig {
  if (_config) return _config

  const env = process.env['NODE_ENV'] ?? 'production'
  const base = loadYaml(join(configDir, 'config.default.yaml')) as Record<string, unknown>
  const override = loadYaml(join(configDir, `config.${env}.yaml`)) as Record<string, unknown>
  const merged = deepMerge(base, override)

  const result = AppConfigSchema.safeParse(merged)
  if (!result.success) {
    throw new Error(`Invalid app config: ${result.error.message}`)
  }

  _config = Object.freeze(result.data)
  return _config
}

export function getConfig(): AppConfig {
  if (!_config) throw new Error('Config not loaded — call loadConfig() first')
  return _config
}
