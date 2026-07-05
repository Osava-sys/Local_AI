import { describe, expect, it } from 'vitest'
import {
  highestRiskPriority,
  scoreObservedService,
  scoreObservedServices,
} from '../../src/main/agent/risk-scoring'

describe('risk scoring', () => {
  it('matches the documented LAN SSH + observed CVE scoring example', () => {
    const finding = scoreObservedService({
      target: '192.168.1.5',
      port: 22,
      protocol: 'tcp',
      service: 'ssh',
      version: 'OpenSSH 7.4p1 Ubuntu',
      exposure: 'lan',
      cves: ['CVE-2020-1576'],
    })

    expect(finding.riskScore).toBe(90)
    expect(finding.priority).toBe('HIGH')
    expect(finding.cveMatched).toEqual(['CVE-2020-1576'])
  })

  it('deduplicates observations and keeps the strongest exposure', () => {
    const findings = scoreObservedServices([
      {
        target: '127.0.0.1',
        port: 5432,
        protocol: 'tcp',
        service: 'postgresql',
        exposure: 'localhost',
      },
      {
        target: '127.0.0.1',
        port: 5432,
        protocol: 'tcp',
        service: 'postgresql',
        exposure: 'all_interfaces',
      },
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0].exposure).toBe('all_interfaces')
    expect(highestRiskPriority(findings)).toBe(findings[0].priority)
  })
})
