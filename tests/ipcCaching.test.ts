import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal('window', {
  api: {
    invoke: vi.fn().mockResolvedValue([]),
    on: vi.fn().mockReturnValue(() => {}),
  },
})

import { typedInvoke, invalidateCache, clearIpcCache } from '../src/api/ipc'

beforeEach(() => {
  clearIpcCache()
  vi.clearAllMocks()
})

describe('typedInvoke caching', () => {
  it('caches cacheable channel results', async () => {
    const mockResult = [{ id: 1, name: 'test' }]
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

    const result1 = await typedInvoke('db-get-setting', 'ui-theme')
    const result2 = await typedInvoke('db-get-setting', 'ui-theme')

    expect(result1).toEqual(mockResult)
    expect(result2).toEqual(mockResult)
    // invoke should only be called once (second call uses cache)
    expect(window.api.invoke).toHaveBeenCalledTimes(1)
  })

  it('does not cache non-cacheable channels', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await typedInvoke('chat-session-create', { id: 's1', title: 'Test', system_prompt: '' })
    await typedInvoke('chat-session-create', { id: 's1', title: 'Test', system_prompt: '' })

    expect(window.api.invoke).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent requests', async () => {
    let resolvePromise: (v: unknown) => void
    const pending = new Promise((resolve) => {
      resolvePromise = resolve
    })
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockReturnValue(pending)

    const p1 = typedInvoke('problems-list', {})
    const p2 = typedInvoke('problems-list', {})

    resolvePromise!([{ id: 1 }])

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual([{ id: 1 }])
    expect(r2).toEqual([{ id: 1 }])
    expect(window.api.invoke).toHaveBeenCalledTimes(1)
  })
})

describe('invalidateCache', () => {
  it('removes cache entries for a channel prefix', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockResolvedValue('mocha')

    await typedInvoke('db-get-setting', 'ui-theme')
    expect(window.api.invoke).toHaveBeenCalledTimes(1)

    invalidateCache('db-get-setting')

    await typedInvoke('db-get-setting', 'ui-theme')
    expect(window.api.invoke).toHaveBeenCalledTimes(2)
  })

  it('only removes matching prefix entries', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await typedInvoke('problems-list', {})
    await typedInvoke('db-get-setting', 'key')

    invalidateCache('problems-list')

    // db-get-setting should still be cached
    await typedInvoke('db-get-setting', 'key')
    expect(window.api.invoke).toHaveBeenCalledTimes(2) // problems-list called again, db-get-setting cached
  })
})

describe('clearIpcCache', () => {
  it('clears all cache entries', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockResolvedValue('value')

    await typedInvoke('db-get-setting', 'key1')
    await typedInvoke('db-get-setting', 'key2')
    expect(window.api.invoke).toHaveBeenCalledTimes(2)

    clearIpcCache()

    await typedInvoke('db-get-setting', 'key1')
    expect(window.api.invoke).toHaveBeenCalledTimes(3)
  })
})
