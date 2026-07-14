import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    decryptString: vi.fn((value: Buffer) => value.toString()),
  },
}))
vi.mock('../electron/db/index', () => ({ getDB: vi.fn() }))
vi.mock('../electron/ipc/chat', () => ({
  getRelevantMemories: vi.fn(() => []),
  markMemoriesUsed: vi.fn(),
}))

import { buildSessionMessages, parseSseContentLine } from '../electron/ipc/ai'

describe('AI provider SSE parsing', () => {
  it('accepts data fields with or without a space after the colon', () => {
    const payload = JSON.stringify({ choices: [{ delta: { content: '你好' } }] })
    expect(parseSseContentLine(`data: ${payload}`)).toBe('你好')
    expect(parseSseContentLine(`data:${payload}`)).toBe('你好')
  })

  it('ignores done markers, non-data fields, and malformed JSON', () => {
    expect(parseSseContentLine('data: [DONE]')).toBeNull()
    expect(parseSseContentLine('event: message')).toBeNull()
    expect(parseSseContentLine('data: {broken')).toBeNull()
  })
})

describe('AI provider message assembly', () => {
  it('does not duplicate a persisted current user message or session persona', () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('system_prompt')) {
          return { get: vi.fn(() => ({ system_prompt: 'You are a tutor' })) }
        }
        return {
          all: vi.fn(() => [
            { id: 3, role: 'user', content: 'current question' },
            { id: 2, role: 'assistant', content: 'older answer' },
            { id: 1, role: 'user', content: 'older question' },
          ]),
        }
      }),
    }

    const result = buildSessionMessages(
      db as never,
      'session-1',
      [
        { role: 'system', content: '  You are a tutor\n' },
        { role: 'user', content: 'current question' },
      ],
      3,
    )

    expect(result).toEqual([
      { role: 'system', content: 'You are a tutor' },
      { role: 'user', content: 'older question' },
      { role: 'assistant', content: 'older answer' },
      { role: 'user', content: 'current question' },
    ])
  })

  it('replaces the persisted current user message with its outgoing override', () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('system_prompt')) {
          return { get: vi.fn(() => ({ system_prompt: '' })) }
        }
        return {
          all: vi.fn(() => [
            { id: 3, role: 'user', content: 'raw current question' },
            { id: 2, role: 'assistant', content: 'older answer' },
            { id: 1, role: 'user', content: 'older question' },
          ]),
        }
      }),
    }

    const result = buildSessionMessages(
      db as never,
      'session-1',
      [{ role: 'user', content: 'context-enriched current question' }],
      3,
    )

    expect(result).toEqual([
      { role: 'user', content: 'older question' },
      { role: 'assistant', content: 'older answer' },
      { role: 'user', content: 'context-enriched current question' },
    ])
  })

  it('does not remove a different concurrent user message', () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('system_prompt')) {
          return { get: vi.fn(() => ({ system_prompt: '' })) }
        }
        return {
          all: vi.fn(() => [
            { id: 2, role: 'user', content: 'request B' },
            { id: 1, role: 'user', content: 'request A' },
          ]),
        }
      }),
    }

    const result = buildSessionMessages(
      db as never,
      'session-1',
      [{ role: 'user', content: 'request A with context' }],
      1,
    )

    expect(result).toEqual([
      { role: 'user', content: 'request B' },
      { role: 'user', content: 'request A with context' },
    ])
  })

  it('keeps twenty prior messages after excluding the persisted current row', () => {
    const rows = Array.from({ length: 22 }, (_, index) => ({
      id: index + 1,
      role: 'user',
      content: `message-${index + 1}`,
    }))
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('system_prompt')) {
          return { get: vi.fn(() => ({ system_prompt: '' })) }
        }
        return { all: vi.fn(() => [...rows].reverse()) }
      }),
    }

    const result = buildSessionMessages(
      db as never,
      'session-1',
      [{ role: 'user', content: 'current override' }],
      22,
    )

    expect(result).toHaveLength(21)
    expect(result[0]).toEqual({ role: 'user', content: 'message-2' })
    expect(result.at(-1)).toEqual({ role: 'user', content: 'current override' })
  })
})
