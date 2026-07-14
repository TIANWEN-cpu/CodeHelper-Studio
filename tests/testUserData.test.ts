import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, parse } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { E2E_USER_DATA_ENV, configureTestUserData } from '../electron/utils/testUserData'

const createdDirectories: string[] = []

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('isolated Electron userData', () => {
  it('leaves the normal profile untouched when the E2E variable is absent', () => {
    const setPath = vi.fn()

    expect(configureTestUserData({ setPath }, {})).toBeNull()
    expect(setPath).not.toHaveBeenCalled()
  })

  it('creates and selects an explicit temporary profile before startup', () => {
    const parent = mkdtempSync(join(tmpdir(), 'codehelper-e2e-parent-'))
    createdDirectories.push(parent)
    const userDataPath = join(parent, 'profile')
    const setPath = vi.fn()

    expect(configureTestUserData({ setPath }, { [E2E_USER_DATA_ENV]: userDataPath })).toBe(
      userDataPath,
    )
    expect(existsSync(userDataPath)).toBe(true)
    expect(setPath).toHaveBeenCalledWith('userData', userDataPath)
  })

  it('rejects relative and filesystem-root paths', () => {
    const setPath = vi.fn()

    expect(() =>
      configureTestUserData({ setPath }, { [E2E_USER_DATA_ENV]: 'relative-profile' }),
    ).toThrow('absolute path')
    expect(() =>
      configureTestUserData({ setPath }, { [E2E_USER_DATA_ENV]: parse(process.cwd()).root }),
    ).toThrow('filesystem root')
    expect(setPath).not.toHaveBeenCalled()
  })
})
