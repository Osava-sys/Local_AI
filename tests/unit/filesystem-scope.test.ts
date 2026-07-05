import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { FilesystemScope } from '../../src/main/sandbox/filesystem-scope'
import { DEFAULT_SANDBOX_POLICY } from '../../src/main/sandbox/policy'

const root = resolve(process.cwd(), 'tmp-scope-root')
const scope = new FilesystemScope(DEFAULT_SANDBOX_POLICY, root)

describe('FilesystemScope', () => {
  it('accepts paths inside the workspace root', () => {
    const check = scope.check('notes/report.txt')
    expect(check.ok).toBe(true)
    expect(check.resolvedPath).toBe(resolve(root, 'notes/report.txt'))
  })

  it('rejects path traversal that escapes the root', () => {
    expect(scope.check('../secret.txt').ok).toBe(false)
    expect(scope.check('../../etc/passwd').ok).toBe(false)
  })

  it('rejects an absolute path outside the root', () => {
    const outside = resolve(process.cwd(), 'somewhere-else', 'x.txt')
    expect(scope.check(outside).ok).toBe(false)
  })

  it('rejects sensitive system paths regardless of root', () => {
    const sensitive = process.platform === 'win32' ? 'C:\\Windows\\System32\\config' : '/etc/shadow'
    expect(scope.check(sensitive).ok).toBe(false)
  })

  it('computes depth relative to the root', () => {
    expect(scope.depthFromRoot(resolve(root, 'a/b/c'))).toBe(3)
    expect(scope.depthFromRoot(root)).toBe(0)
  })
})
