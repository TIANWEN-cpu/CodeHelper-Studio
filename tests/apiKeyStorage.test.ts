import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({
  backend: 'gnome_libsecret',
  available: true,
  encryptString: vi.fn((value: string) => Buffer.from(value)),
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => storage.available,
    getSelectedStorageBackend: () => storage.backend,
    encryptString: storage.encryptString,
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { encryptApiKey } from '../electron/utils/apiKeyStorage'

describe('encryptApiKey', () => {
  beforeEach(() => {
    storage.available = true
    storage.backend = 'gnome_libsecret'
    storage.encryptString.mockClear()
  })

  it('rejects Electron basic_text storage on Linux', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    storage.backend = 'basic_text'

    expect(() => encryptApiKey('sk-secret')).toThrow('Secure API key storage is unavailable')
    expect(storage.encryptString).not.toHaveBeenCalled()
    platform.mockRestore()
  })

  it('uses an OS-backed Linux keyring when available', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')

    expect(encryptApiKey('sk-secret')).toBe(`enc:${Buffer.from('sk-secret').toString('base64')}`)
    expect(storage.encryptString).toHaveBeenCalledWith('sk-secret')
    platform.mockRestore()
  })
})
