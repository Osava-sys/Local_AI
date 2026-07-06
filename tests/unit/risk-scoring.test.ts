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

  it('deduplicates IPv4 and IPv6 all-interface binds for the same service', () => {
    const findings = scoreObservedServices([
      {
        target: '0.0.0.0',
        port: 5432,
        protocol: 'tcp',
        service: 'postgresql',
        exposure: 'all_interfaces',
      },
      {
        target: '[::]',
        port: 5432,
        protocol: 'tcp',
        service: 'postgresql',
        exposure: 'all_interfaces',
      },
      {
        target: '192.168.11.118',
        port: 5432,
        protocol: 'tcp',
        service: 'postgresql',
        exposure: 'lan',
      },
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      target: '0.0.0.0',
      port: 5432,
      protocol: 'tcp',
      service: 'postgresql',
      exposure: 'all_interfaces',
      riskScore: 24,
      priority: 'MEDIUM',
    })
  })

  it('keeps all-interface database exposure at medium without version or CVE evidence', () => {
    const finding = scoreObservedService({
      target: '0.0.0.0',
      port: 27017,
      protocol: 'tcp',
      service: 'mongodb',
      exposure: 'all_interfaces',
    })

    expect(finding.riskScore).toBe(24)
    expect(finding.priority).toBe('MEDIUM')
  })

  it('normalizes service aliases before deduplicating findings', () => {
    const findings = scoreObservedServices([
      {
        target: '0.0.0.0',
        port: 445,
        protocol: 'tcp',
        service: 'microsoft-ds',
        exposure: 'all_interfaces',
      },
      {
        target: '[::]',
        port: 445,
        protocol: 'tcp',
        service: 'smb',
        exposure: 'all_interfaces',
      },
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0].service).toBe('smb')
  })
})
