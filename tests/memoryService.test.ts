import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
const mockInvalidate = vi.fn()
vi.mock('@/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  invalidateCache: (...args: unknown[]) => mockInvalidate(...args),
}))

import {
  getSendCategories,
  setSendCategories,
  getLlmExtractEnabled,
  setLlmExtractEnabled,
  batchMemories,
  previewContext,
  MEMORY_CATEGORIES,
} from '../src/services/memoryService'

beforeEach(() => {
  mockInvoke.mockReset()
  mockInvalidate.mockReset()
})

describe('getSendCategories', () => {
  it('defaults to all categories when unset', async () => {
    mockInvoke.mockResolvedValueOnce(null)
    expect(await getSendCategories()).toEqual(MEMORY_CATEGORIES)
  })

  it('parses a stored subset and drops unknown entries', async () => {
    mockInvoke.mockResolvedValueOnce(JSON.stringify(['tech', 'goal', 'bogus']))
    expect(await getSendCategories()).toEqual(['tech', 'goal'])
  })

  it('falls back to all categories on corrupt JSON', async () => {
    mockInvoke.mockResolvedValueOnce('{not json')
    expect(await getSendCategories()).toEqual(MEMORY_CATEGORIES)
  })
})

describe('setSendCategories', () => {
  it('persists JSON and invalidates the settings cache', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    await setSendCategories(['tech'])
    expect(mockInvoke).toHaveBeenCalledWith(
      'db-set-setting',
      'memory_send_categories',
      JSON.stringify(['tech']),
    )
    expect(mockInvalidate).toHaveBeenCalledWith('db-get-setting')
  })
})

describe('getLlmExtractEnabled', () => {
  it('returns true only for the string "true"', async () => {
    mockInvoke.mockResolvedValueOnce('true')
    expect(await getLlmExtractEnabled()).toBe(true)
    mockInvoke.mockResolvedValueOnce('false')
    expect(await getLlmExtractEnabled()).toBe(false)
    mockInvoke.mockResolvedValueOnce(null)
    expect(await getLlmExtractEnabled()).toBe(false)
  })
})

describe('setLlmExtractEnabled', () => {
  it('stores the boolean as a string', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    await setLlmExtractEnabled(true)
    expect(mockInvoke).toHaveBeenCalledWith('db-set-setting', 'memory_llm_extract', 'true')
  })
})

describe('batchMemories', () => {
  it('returns the affected count', async () => {
    mockInvoke.mockResolvedValueOnce({ affected: 3 })
    expect(await batchMemories([1, 2, 3], 'delete')).toBe(3)
    expect(mockInvoke).toHaveBeenCalledWith('chat-memories-batch', {
      ids: [1, 2, 3],
      action: 'delete',
    })
  })
})

describe('previewContext', () => {
  it('forwards query, includeMemories and categories', async () => {
    mockInvoke.mockResolvedValueOnce({ memories: [] })
    await previewContext('python', true, ['tech'])
    expect(mockInvoke).toHaveBeenCalledWith('chat-context-preview', {
      query: 'python',
      includeMemories: true,
      memoryCategories: ['tech'],
    })
  })
})
