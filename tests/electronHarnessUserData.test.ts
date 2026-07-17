import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

interface ElectronAppStub {
  exit(exitCode: number): void
  getPath(name: 'appData' | 'userData'): string
  isReady(): boolean
  setPath(name: 'userData', value: string): void
}

interface ElectronUserDataIsolation {
  cleanup(): void
  formalProfilePaths: readonly string[]
  path: string
}

interface ElectronUserDataHarness {
  assertSafeTemporaryUserDataPath(userDataPath: string, prefix: string, tempRoot?: string): string
  createIsolatedElectronUserData(
    targetApp: ElectronAppStub,
    prefix: string,
  ): ElectronUserDataIsolation
  finishIsolatedElectronTest(
    targetApp: ElectronAppStub,
    isolation: ElectronUserDataIsolation,
    exitCode: number,
  ): void
}

const require = createRequire(import.meta.url)
const harness = require('../scripts/electron-test-user-data.cjs') as ElectronUserDataHarness

function createAppStub(ready = false): {
  app: ElectronAppStub
  exit: ReturnType<typeof vi.fn>
  formalProfile: string
  setPath: ReturnType<typeof vi.fn>
} {
  const appData = join(tmpdir(), 'codehelper-formal-profile-parent')
  const formalProfile = join(appData, 'codehelper')
  let selectedUserData = formalProfile
  const setPath = vi.fn((_name: 'userData', value: string) => {
    selectedUserData = value
  })
  const exit = vi.fn()
  return {
    app: {
      exit,
      getPath: (name) => (name === 'appData' ? appData : selectedUserData),
      isReady: () => ready,
      setPath,
    },
    exit,
    formalProfile,
    setPath,
  }
}

describe('standalone Electron harness userData isolation', () => {
  it('selects a unique non-formal profile and removes it before exit', () => {
    const { app, exit, formalProfile, setPath } = createAppStub()
    const isolation = harness.createIsolatedElectronUserData(app, 'codehelper-harness-contract-')

    expect(resolve(isolation.path)).not.toBe(resolve(formalProfile))
    expect(existsSync(isolation.path)).toBe(true)
    expect(setPath).toHaveBeenCalledWith('userData', isolation.path)
    expect(isolation.formalProfilePaths.map((value) => resolve(value))).toContain(
      resolve(formalProfile),
    )

    harness.finishIsolatedElectronTest(app, isolation, 0)

    expect(existsSync(isolation.path)).toBe(false)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('rejects late configuration and cleanup paths outside its scoped temp prefix', () => {
    const { app, setPath } = createAppStub(true)

    expect(() =>
      harness.createIsolatedElectronUserData(app, 'codehelper-harness-contract-'),
    ).toThrow('before app.whenReady()')
    expect(setPath).not.toHaveBeenCalled()
    expect(() =>
      harness.assertSafeTemporaryUserDataPath(
        join(tmpdir(), 'unrelated-profile'),
        'codehelper-harness-contract-',
      ),
    ).toThrow('expected unique prefix')
    expect(() =>
      harness.assertSafeTemporaryUserDataPath(
        join(tmpdir(), '..', 'codehelper-harness-contract-unsafe'),
        'codehelper-harness-contract-',
      ),
    ).toThrow('outside the OS temporary directory')
  })

  it('configures every standalone Electron audit before readiness with distinct profiles', () => {
    const files = [
      'scripts/verify-exercise-drafts-electron.cjs',
      'tests/electronSqlUtilitySmoke.cjs',
      'tests/electronCodeRunnerUtilitySmoke.cjs',
    ]
    const prefixes = new Set<string>()

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const configurationIndex = source.indexOf('createIsolatedElectronUserData(')
      const readyIndex = source.indexOf('.whenReady()')
      const match = source.match(/createIsolatedElectronUserData\(\s*app,\s*'([^']+)'\s*,?\s*\)/)

      expect(configurationIndex, file).toBeGreaterThan(-1)
      expect(readyIndex, file).toBeGreaterThan(configurationIndex)
      expect(source, file).toContain('finishIsolatedElectronTest(app, isolatedUserData,')
      expect(match, file).not.toBeNull()
      prefixes.add(match?.[1] ?? '')
    }

    expect(prefixes.size).toBe(files.length)
  })
})
