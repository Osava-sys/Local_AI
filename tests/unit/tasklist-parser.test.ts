import { describe, it, expect } from 'vitest'
import { parseTasklistOutput, summarizeTasklistProcesses } from '../../src/main/sandbox/parsers/tasklist.parser'

describe('parseTasklistOutput', () => {
  it('parses standard Windows tasklist rows into process identities', () => {
    const raw = ['mongod.exe     5708 Console 10  120000 Ko', 'postgres.exe   8016 Services 0   50000 Ko'].join(
      '\n',
    )

    expect(parseTasklistOutput(raw)).toEqual([
      { imageName: 'mongod.exe', pid: 5708 },
      { imageName: 'postgres.exe', pid: 8016 },
    ])
  })

  it('parses CSV tasklist output and ignores headers', () => {
    const raw = [
      '"Image Name","PID","Session Name","Session#","Mem Usage"',
      '"node.exe","1234","Console","1","75,000 K"',
    ].join('\n')

    expect(parseTasklistOutput(raw)).toEqual([{ imageName: 'node.exe', pid: 1234 }])
  })

  it('summarizes high-signal processes first for agent observations', () => {
    const summary = summarizeTasklistProcesses([
      { imageName: 'explorer.exe', pid: 100 },
      { imageName: 'postgres.exe', pid: 8016 },
      { imageName: 'mongod.exe', pid: 5708 },
      { imageName: 'svchost.exe', pid: 992 },
    ])

    expect(summary).toContain('Tasklist summary: 4 process')
    expect(summary).toContain('pid=8016 process=postgres.exe')
    expect(summary).toContain('pid=5708 process=mongod.exe')
    expect(summary).not.toContain('pid=100 process=explorer.exe')
  })
})
