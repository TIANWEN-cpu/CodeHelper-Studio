const BOOT_SCOPE_PREFIX = 'boot-'
const RENDERER_SCOPE_SEPARATOR = '--renderer-'

function createOpaqueId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeScope(value: string, fallback: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || fallback
}

let fallbackBootScope: string | null = null

export function getRecoveryBootScope(): string {
  const exposed =
    typeof window !== 'undefined' && typeof window.api?.recoveryBootId === 'string'
      ? window.api.recoveryBootId
      : ''
  if (exposed.trim()) return normalizeScope(exposed, 'unknown')
  fallbackBootScope ??= normalizeScope(createOpaqueId(), 'unknown')
  return fallbackBootScope
}

export function createBootScopedRecoverySessionId(
  rendererScope = createOpaqueId(),
  bootScope = getRecoveryBootScope(),
): string {
  return `${BOOT_SCOPE_PREFIX}${normalizeScope(bootScope, 'unknown')}${RENDERER_SCOPE_SEPARATOR}${normalizeScope(rendererScope, 'unknown')}`
}

export function recoverySessionBootScope(sessionId: string): string | null {
  if (!sessionId.startsWith(BOOT_SCOPE_PREFIX)) return null
  const separatorIndex = sessionId.indexOf(RENDERER_SCOPE_SEPARATOR, BOOT_SCOPE_PREFIX.length)
  if (separatorIndex < 0) return null
  const bootScope = sessionId.slice(BOOT_SCOPE_PREFIX.length, separatorIndex)
  return bootScope || null
}

export function recoveryKeyBootScope(key: string, keyPrefix: string): string | null {
  if (!key.startsWith(keyPrefix)) return null
  return recoverySessionBootScope(key.slice(keyPrefix.length))
}
