import { existsSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import type { ModelQuantization } from '@shared/types/model.types'

export function inferQuantization(filePath: string): ModelQuantization | 'unknown' {
  const upper = basename(filePath).toUpperCase()
  if (upper.includes('Q8_0')) return 'Q8_0'
  if (upper.includes('Q5_K_M')) return 'Q5_K_M'
  if (upper.includes('Q4_K_M')) return 'Q4_K_M'
  return 'unknown'
}

export function isGgufFile(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.gguf'
}

export function getModelFileInfo(filePath: string): { filename: string; sizeBytes: number; quantization: ModelQuantization | 'unknown' } {
  if (!existsSync(filePath)) throw new Error(`Model file not found: ${filePath}`)
  if (!isGgufFile(filePath)) throw new Error('Only .gguf models are supported by the llama.cpp runtime.')
  const stat = statSync(filePath)
  if (!stat.isFile()) throw new Error(`Model path is not a file: ${filePath}`)
  return {
    filename: basename(filePath),
    sizeBytes: stat.size,
    quantization: inferQuantization(filePath),
  }
}

export function defaultLlamaServerCandidates(appPath: string): string[] {
  const binaryName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const legacyBinaryName = process.platform === 'win32' ? 'server.exe' : 'server'
  return [
    process.env['LLAMA_CPP_SERVER_PATH'] ?? '',
    join(appPath, 'resources', 'bin', 'llama-cpp', binaryName),
    join(appPath, 'resources', 'bin', 'llama-cpp', legacyBinaryName),
    join(process.cwd(), 'resources', 'bin', 'llama-cpp', binaryName),
    join(process.cwd(), 'resources', 'bin', 'llama-cpp', legacyBinaryName),
    binaryName,
    legacyBinaryName,
  ].filter(Boolean)
}
