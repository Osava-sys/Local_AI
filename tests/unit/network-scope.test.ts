import { describe, it, expect } from 'vitest'
import { classifyTarget, isLocalTarget } from '../../src/main/sandbox/network-scope'

describe('network scope classification', () => {
  it('treats loopback hosts and 127.0.0.0/8 as loopback', () => {
    expect(classifyTarget('localhost')).toBe('loopback')
    expect(classifyTarget('127.0.0.1')).toBe('loopback')
    expect(classifyTarget('::1')).toBe('loopback')
  })

  it('treats RFC1918 ranges as private', () => {
    expect(classifyTarget('10.0.0.5')).toBe('private')
    expect(classifyTarget('172.16.5.5')).toBe('private')
    expect(classifyTarget('192.168.1.10')).toBe('private')
  })

  it('treats public addresses and hostnames as external', () => {
    expect(classifyTarget('8.8.8.8')).toBe('external')
    expect(classifyTarget('172.32.0.1')).toBe('external')
    expect(classifyTarget('example.com')).toBe('external')
  })

  it('strips scheme, port, and path before classifying', () => {
    expect(classifyTarget('http://localhost:8080/scan')).toBe('loopback')
    expect(classifyTarget('https://192.168.0.1/admin')).toBe('private')
  })

  it('isLocalTarget is true only for loopback or private', () => {
    expect(isLocalTarget('127.0.0.1')).toBe(true)
    expect(isLocalTarget('192.168.1.1')).toBe(true)
    expect(isLocalTarget('8.8.8.8')).toBe(false)
  })
})
