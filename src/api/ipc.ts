// 仅缓存经 typedInvoke 调用且会话内稳定的只读通道。
// 注意：knowledge-list 走 services/ipc 的（未缓存）invoke，不在此列；若将来改为
// typedInvoke 取列表，再加回并确保在 knowledge 变更后调用 invalidateCache('knowledge-list')。
const CACHEABLE_CHANNELS = new Set(['db-get-setting', 'problems-list'])

const responseCache = new Map<string, unknown>()
const pendingCache = new Map<string, Promise<unknown>>()

function cacheKey(channel: string, args: unknown[]) {
  return `${channel}:${JSON.stringify(args)}`
}

export async function typedInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  if (!CACHEABLE_CHANNELS.has(channel)) {
    return window.api.invoke(channel, ...args) as Promise<T>
  }

  const key = cacheKey(channel, args)
  if (responseCache.has(key)) return responseCache.get(key) as T
  if (pendingCache.has(key)) return pendingCache.get(key) as Promise<T>

  const request = (window.api.invoke(channel, ...args) as Promise<T>)
    .then((value) => {
      responseCache.set(key, value)
      pendingCache.delete(key)
      return value
    })
    .catch((error) => {
      pendingCache.delete(key)
      throw error
    })
  pendingCache.set(key, request)
  return request
}

export function typedOn<T = unknown>(channel: string, callback: (payload: T) => void): () => void {
  return window.api.on(channel, (payload: T) => callback(payload))
}

export function invalidateCache(channelPrefix: string): void {
  for (const key of [...responseCache.keys()]) {
    if (key.startsWith(`${channelPrefix}:`)) responseCache.delete(key)
  }
  for (const key of [...pendingCache.keys()]) {
    if (key.startsWith(`${channelPrefix}:`)) pendingCache.delete(key)
  }
}

export function clearIpcCache(): void {
  responseCache.clear()
  pendingCache.clear()
}
