import { describe, it, expect, beforeEach } from 'vitest'
import {
  detectTool,
  isToolAvailable,
  markToolUnavailable,
  resetToolAvailabilityCache,
  resolveExecutable,
} from '../../src/main/sandbox/tool-availability'
import { buildEnvironmentPrompt } from '../../src/main/agent/prompts/environment'

describe('tool availability detection', () => {
  beforeEach(() => resetToolAvailabilityCache())

  it('resolves a tool from an explicit configured path', () => {
    const result = detectTool('node', process.execPath)
    expect(result.available).toBe(true)
    expect(result.source).toBe('configured')
    expect(result.path).toBe(process.execPath)
  })

  it('finds the node binary on PATH', () => {
    // The test runner is Node, so `node` must be resolvable on PATH.
    expect(resolveExecutable('node').available).toBe(true)
  })

  it('reports a nonexistent binary as unavailable', () => {
    expect(isToolAvailable('definitely_not_a_real_binary_xyz')).toBe(false)
  })

  it('remembers a runtime miss so the tool stays unavailable', () => {
    markToolUnavailable('nmap')
    expect(isToolAvailable('nmap')).toBe(false)
    expect(detectTool('nmap').source).toBe('missing')
  })

  it('labels unavailable executables as CLI backends rather than missing Nexus wrappers', () => {
    const prompt = buildEnvironmentPrompt()
    expect(prompt).toContain('Binaires CLI de sécurité détectés')
    expect(prompt).toContain('pas les wrappers Nexus `*.tool.ts`')
    expect(prompt).toContain('backend CLI est indisponible')
  })
})
