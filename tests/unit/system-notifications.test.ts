import { describe, expect, it } from 'vitest'
import type { ModelRuntimeStatus } from '../../src/shared/types/model.types'
import { buildSystemNotifications } from '../../src/renderer/src/lib/system-notifications'

describe('system notification state', () => {
  it('moves the four former header badges inside the notification model', () => {
    const items = buildSystemNotifications({
      agentState: 'idle',
      modelStatus: null,
      pendingApprovals: 0,
      sandboxActive: false,
    })

    expect(items.map((item) => item.label)).toEqual([
      'Modèle inactif',
      'Inactif',
      'Approbations à jour',
      'Sandbox inactive',
    ])
  })

  it('reflects live model, agent, approval and sandbox states', () => {
    const model: ModelRuntimeStatus = {
      state: 'running',
      device: 'cpu',
      loadedModelId: 'qwen',
      modelName: 'Qwen local',
      endpoint: 'http://127.0.0.1:8080',
      pid: 42,
      error: null,
      startedAt: '2026-07-16T12:00:00.000Z',
    }
    const items = buildSystemNotifications({
      agentState: 'awaiting_approval',
      modelStatus: model,
      pendingApprovals: 2,
      sandboxActive: true,
    })

    expect(items.map((item) => item.label)).toEqual([
      'Modèle actif',
      'Approbation requise',
      '2 approbations en attente',
      'Sandbox active',
    ])
    expect(items.filter((item) => item.tone === 'warning')).toHaveLength(2)
  })
})
