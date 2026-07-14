import { safeStorage } from 'electron'

export function encryptApiKey(apiKey: string): string {
  const storageBackend =
    process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function'
      ? safeStorage.getSelectedStorageBackend()
      : undefined
  if (!safeStorage.isEncryptionAvailable() || storageBackend === 'basic_text') {
    throw new Error('Secure API key storage is unavailable on this system')
  }
  return 'enc:' + safeStorage.encryptString(apiKey).toString('base64')
}

export function decryptApiKey(value: string): string {
  if (!value.startsWith('enc:')) return value
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
  } catch (error) {
    console.warn('decryptApiKey failed, data may be corrupted:', error)
    return ''
  }
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''
  if (apiKey.length < 16) return '********'
  return `${apiKey.slice(0, 3)}********${apiKey.slice(-4)}`
}

export function isMaskedApiKey(value: string): boolean {
  return value === '********' || /^.{3}\*{8}.{4}$/s.test(value)
}
