/**
 * Type-safe IPC invoke wrapper with caching and deduplication.
 *
 * Replaces `(await window.api.invoke(channel, ...args)) as SomeType`
 * with `await typedInvoke(channel, ...args)` which is fully type-safe.
 *
 * Performance features:
 * - In-memory cache for frequently read data (settings, configs)
 * - Request deduplication to avoid duplicate concurrent IPC calls
 * - Hard cap on cache entries to prevent unbounded memory growth
 */

import type { IpcChannelMap, IpcEventMap } from '../types/ipc'

// ---------------------------------------------------------------------------
// Cache for frequently accessed read-only data
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: unknown
  expiresAt: number
}

const CACHE_TTL_MS = 30_000 // 30 seconds for read-only data
const CACHE_MAX_ENTRIES = 200 // Hard cap to prevent unbounded memory growth
const ipcCache = new Map<string, CacheEntry>()

/** Channels that are safe to cache (read-only, idempotent). */
const CACHEABLE_CHANNELS = new Set<string>([
  'db-get-setting',
  'db-get-ai-configs',
  'db-get-default-ai-config',
  'problems-list',
  'mistakes-list',
  'chat-sessions-list',
  'chat-presets-list',
  'platform-info',
])

function cacheKey<K extends keyof IpcChannelMap>(
  channel: K,
  args: IpcChannelMap[K]['args'],
): string {
  return `${channel}:${JSON.stringify(args)}`
}

/**
 * Evict expired entries and enforce the hard size cap.
 * Removes oldest (first-inserted) entries when over limit.
 */
function evictCache(): void {
  const now = Date.now()
  // Remove expired entries first
  for (const [key, entry] of ipcCache) {
    if (entry.expiresAt <= now) {
      ipcCache.delete(key)
    }
  }
  // If still over cap, remove oldest entries (Map preserves insertion order)
  while (ipcCache.size > CACHE_MAX_ENTRIES) {
    const oldest = ipcCache.keys().next()
    if (!oldest.done) {
      ipcCache.delete(oldest.value)
    } else {
      break
    }
  }
}

/** Invalidate all cache entries for a channel (call after writes). */
export function invalidateCache(channelPrefix: string) {
  for (const key of ipcCache.keys()) {
    if (key.startsWith(channelPrefix + ':')) {
      ipcCache.delete(key)
    }
  }
}

/** Clear the entire IPC cache. */
export function clearIpcCache() {
  ipcCache.clear()
}

// ---------------------------------------------------------------------------
// Request deduplication
// ---------------------------------------------------------------------------

const inflightRequests = new Map<string, Promise<unknown>>()

// ---------------------------------------------------------------------------
// Type-safe invoke with caching + dedup
// ---------------------------------------------------------------------------

/**
 * Type-safe wrapper around `window.api.invoke`.
 *
 * Infers argument types and return type from the channel name.
 * Applies caching and request deduplication for eligible channels.
 */
export async function typedInvoke<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: IpcChannelMap[K]['args']
): Promise<IpcChannelMap[K]['result']> {
  const key = cacheKey(channel, args)

  // Check cache for cacheable channels
  if (CACHEABLE_CHANNELS.has(channel as string)) {
    const cached = ipcCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as IpcChannelMap[K]['result']
    }
  }

  // Evict stale/overflow entries periodically (when 80% full)
  if (ipcCache.size > CACHE_MAX_ENTRIES * 0.8) {
    evictCache()
  }

  // Deduplicate concurrent requests for the same key
  const existing = inflightRequests.get(key)
  if (existing) {
    return existing as Promise<IpcChannelMap[K]['result']>
  }

  const promise = window.api
    .invoke(channel, ...args)
    .then((result) => {
      // Cache the result for cacheable channels
      if (CACHEABLE_CHANNELS.has(channel as string)) {
        ipcCache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS })
      }
      return result
    })
    .finally(() => {
      inflightRequests.delete(key)
    }) as Promise<IpcChannelMap[K]['result']>

  inflightRequests.set(key, promise)
  return promise
}

/**
 * Type-safe wrapper around `window.api.on`.
 *
 * Infers the callback payload type from the event channel name.
 */
export function typedOn<K extends keyof IpcEventMap>(
  channel: K,
  callback: (payload: IpcEventMap[K]) => void,
): () => void {
  return window.api.on(channel, (payload: unknown) => {
    callback(payload as IpcEventMap[K])
  })
}
