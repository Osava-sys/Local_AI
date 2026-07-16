import { describe, it, expect, vi } from 'vitest'
import type { ApprovalPolicyConfig } from '@shared/types/approval.types'
import type { FilesystemToolIntent, GenericToolIntent } from '@shared/types/sandbox.types'
import { SandboxExecutor } from '../../src/main/sandbox/sandbox-executor'
import { ApprovalGate } from '../../src/main/sandbox/approval-gate'
import { ApprovalPolicy } from '../../src/main/approvals/approval-policy'
import type { ChildProcessRunner } from '../../src/main/sandbox/child-runner'

const allowAll: ApprovalPolicyConfig = {
  defaultDecision: 'allow',
  criticalPatterns: [],
  deniedPatterns: [],
  localTargets: [],
  highRiskTools: [],
}

function makeExecutor() {
  const run = vi.fn()
  const runner = { run } as unknown as ChildProcessRunner
  return {
    executor: new SandboxExecutor(new ApprovalGate(new ApprovalPolicy(allowAll)), runner),
    run,
  }
}

describe('SandboxExecutor — filesystem directory read', () => {
  it('returns a listing (not EISDIR) when read targets a directory', async () => {
    const { executor } = makeExecutor()
    const intent: FilesystemToolIntent = { id: 'f', kind: 'filesystem', path: '.', mode: 'read' }

    const result = await executor.execute(intent)

    expect(result.status).toBe('success')
    expect(result.observation).toContain('Directory')
    expect(result.observation).toContain('package.json')
  })

  it('searches filenames inside the scoped workspace without spawning a process', async () => {
    const { executor, run } = makeExecutor()
    const intent: FilesystemToolIntent = {
      id: 'fs-search',
      kind: 'filesystem',
      path: '.',
      mode: 'search',
      pattern: ['package.json', '*.config.js'],
      recursive: false,
      maxResults: 10,
    }

    const result = await executor.execute(intent)

    expect(result.status).toBe('success')
    expect(result.observation).toContain('Search')
    expect(result.observation).toContain('package.json')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('SandboxExecutor — workspace discovery runner', () => {
  it('auto-runs a read-only workspace discovery within the scoped root', async () => {
    const { executor, run } = makeExecutor()
    const intent: GenericToolIntent = {
      id: 'w',
      kind: 'workspace',
      payload: { operation: 'discover', depth: 1 },
    }

    const result = await executor.execute(intent)

    expect(result.status).toBe('success')
    expect(result.observation).toContain('Workspace root')
    expect(result.observation).toContain('package.json')
    expect(run).not.toHaveBeenCalled()
  })

  it('still escalates a non-read-only workspace operation to a human', async () => {
    const { executor } = makeExecutor()
    const intent: GenericToolIntent = {
      id: 'w2',
      kind: 'workspace',
      payload: { operation: 'delete' },
    }

    const result = await executor.execute(intent)

    expect(result.status).toBe('requires_approval')
  })
})

describe('SandboxExecutor — shell observation compaction', () => {
  it('compacts ipconfig output into structured network evidence', async () => {
    const { executor, run } = makeExecutor()
    run.mockResolvedValue({
      id: 'ipconfig-1',
      kind: 'shell',
      status: 'success',
      stdout: [
        'Configuration IP de Windows',
        '',
        '   Nom de l’hôte . . . . . . . . . . : LAPTOP-NEXUS',
        '',
        'Carte réseau sans fil Wi-Fi :',
        '   DHCP activé. . . . . . . . . . . . : Oui',
        '   Adresse IPv4. . . . . . . . . . . .: 192.168.1.42(préféré)',
        '   Passerelle par défaut. . . . . . .  : 192.168.1.1',
      ].join('\n'),
      stderr: '',
      observation: 'raw ipconfig output',
      exitCode: 0,
      startedAt: 'a',
      endedAt: 'b',
      durationMs: 4,
    })

    const result = await executor.execute({
      id: 'ipconfig-1',
      kind: 'shell',
      command: 'ipconfig /all',
    })

    expect(result.observation).toContain('Windows network configuration summary')
    expect(result.observation).toContain('Host: LAPTOP-NEXUS')
    expect(result.observation).toContain('IPv4: 192.168.1.42')
    expect(result.metadata).toHaveProperty('ipconfig.adapters.0.status', 'connected')
  })

  it('keeps curl verbose headers emitted on stderr', async () => {
    const { executor, run } = makeExecutor()
    run.mockResolvedValue({
      id: 'curl-1',
      kind: 'shell',
      status: 'success',
      stdout: '<html>ok</html>',
      stderr: '< HTTP/1.1 200 OK\n< Server: Apache',
      observation: '<html>ok</html>',
      exitCode: 0,
      startedAt: 'a',
      endedAt: 'b',
      durationMs: 1,
    })

    const result = await executor.execute({
      id: 'curl-1',
      kind: 'shell',
      command: 'curl',
      args: ['-v', 'http://127.0.0.1:8080/'],
      risk: 'high',
    })

    expect(result.observation).toContain('Status: HTTP/1.1 200 OK')
    expect(result.observation).toContain('- Server: Apache')
    expect(result.observation).toContain('Body preview')
  })
})
