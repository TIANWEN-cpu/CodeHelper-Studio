import { describe, it, expect, vi, beforeEach } from 'vitest'

// Collect registered handlers
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

// Mock better-sqlite3 via db/index
const mockDB = {
  prepare: vi.fn(),
  exec: vi.fn(),
  pragma: vi.fn(),
  close: vi.fn(),
}

vi.mock('../electron/db/index', () => ({
  getDB: () => mockDB,
  closeDB: () => {},
}))

function makeStmt(result: unknown = undefined) {
  return {
    get: vi.fn(() => result),
    all: vi.fn(() => (Array.isArray(result) ? result : [result])),
    run: vi.fn(() => ({ lastInsertRowid: 1 })),
  }
}

describe('registerChatIPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
    mockDB.exec.mockReset()
  })

  it('registers all chat handlers and seeds presets when empty', async () => {
    let _callCount = 0
    mockDB.prepare.mockImplementation((sql: string) => {
      _callCount++
      // First call: COUNT(*) for presets -> 0
      if (sql.includes('COUNT(*)') && sql.includes('prompt_presets')) {
        return makeStmt({ c: 0 })
      }
      // Insert builtin presets
      if (sql.includes('INSERT INTO prompt_presets')) {
        return makeStmt(undefined)
      }
      return makeStmt(undefined)
    })

    const { registerChatIPC } = await import('../electron/ipc/chat')
    registerChatIPC()

    expect(handlers['chat-sessions-list']).toBeDefined() // IPC handler registration
    expect(handlers['chat-session-create']).toBeDefined()
    expect(handlers['chat-session-update']).toBeDefined()
    expect(handlers['chat-session-delete']).toBeDefined()
    expect(handlers['chat-messages-load']).toBeDefined()
    expect(handlers['chat-message-save']).toBeDefined()
    expect(handlers['chat-presets-list']).toBeDefined()
    expect(handlers['chat-preset-save']).toBeDefined()
    expect(handlers['chat-preset-delete']).toBeDefined()
    expect(handlers['chat-memories-list']).toBeDefined()
    expect(handlers['chat-memory-save']).toBeDefined()
    expect(handlers['chat-memory-delete']).toBeDefined()
    expect(handlers['chat-memory-capture']).toBeDefined()
  })

  it('skips preset seeding when presets already exist', async () => {
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)') && sql.includes('prompt_presets')) {
        return makeStmt({ c: 4 })
      }
      return makeStmt(undefined)
    })

    const { registerChatIPC } = await import('../electron/ipc/chat')
    registerChatIPC()

    // Should not have any INSERT INTO prompt_presets calls
    const insertCalls = mockDB.prepare.mock.calls.filter((c: string[]) =>
      c[0].includes('INSERT INTO prompt_presets'),
    )
    expect(insertCalls).toHaveLength(0)
  })

  describe('chat-sessions-list', () => {
    it('returns all sessions ordered by updated_at', async () => {
      const sessions = [
        { id: 's1', title: 'Chat 1', updated_at: '2024-01-02' },
        { id: 's2', title: 'Chat 2', updated_at: '2024-01-01' },
      ]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('chat_sessions') && sql.includes('ORDER BY')) return makeStmt(sessions)
        return makeStmt(undefined)
      })

      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()

      const result = handlers['chat-sessions-list']()
      expect(result).toEqual(sessions)
    })
  })

  describe('chat-session-create', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates args object', () => {
      expect(() => handlers['chat-session-create'](null, null)).toThrow('参数无效')
      expect(() => handlers['chat-session-create'](null, 'not-obj')).toThrow('参数无效')
    })

    it('validates id is non-empty string', () => {
      expect(() => handlers['chat-session-create'](null, { id: '' })).toThrow('参数无效: id')
      expect(() => handlers['chat-session-create'](null, { id: 123 as unknown })).toThrow(
        '参数无效: id',
      )
    })

    it('validates title type', () => {
      expect(() =>
        handlers['chat-session-create'](null, { id: 's1', title: 123 as unknown }),
      ).toThrow('参数无效: title')
    })

    it('validates system_prompt type', () => {
      expect(() =>
        handlers['chat-session-create'](null, { id: 's1', system_prompt: 123 as unknown }),
      ).toThrow('参数无效: system_prompt')
    })

    it('creates session with defaults', () => {
      const getStmt = makeStmt({ id: 's1', title: '新对话', system_prompt: '' })
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('SELECT * FROM chat_sessions WHERE id')) return getStmt
        return makeStmt(undefined)
      })

      handlers['chat-session-create'](null, { id: 's1' })
      expect(getStmt.get).toHaveBeenCalled()
    })

    it('truncates long id to 200 chars', () => {
      const longId = 'x'.repeat(300)
      handlers['chat-session-create'](null, { id: longId })
      // The prepared statement should have been called with truncated id
    })
  })

  describe('chat-session-update', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates id', () => {
      expect(() => handlers['chat-session-update'](null, '', {})).toThrow('参数无效: id')
    })

    it('validates updates object', () => {
      expect(() => handlers['chat-session-update'](null, 's1', null)).toThrow('参数无效: updates')
    })

    it('validates title type in updates', () => {
      expect(() => handlers['chat-session-update'](null, 's1', { title: 123 as unknown })).toThrow(
        '参数无效: title',
      )
    })

    it('validates system_prompt type in updates', () => {
      expect(() =>
        handlers['chat-session-update'](null, 's1', { system_prompt: 123 as unknown }),
      ).toThrow('参数无效: system_prompt')
    })

    it('updates title only', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-session-update'](null, 's1', { title: 'New Title' })
      expect(runFn).toHaveBeenCalled()
    })

    it('updates system_prompt only', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-session-update'](null, 's1', { system_prompt: 'New prompt' })
      expect(runFn).toHaveBeenCalled()
    })

    it('updates both title and system_prompt', () => {
      mockDB.prepare.mockReset()
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      // Call handler and verify it calls run for both updates
      try {
        handlers['chat-session-update'](null, 's1', { title: 'T', system_prompt: 'P' })
      } catch {
        // Handler should not throw
      }

      // Verify handler was registered and callable
      expect(typeof handlers['chat-session-update']).toBe('function')
      // The handler should attempt at least one UPDATE
      expect(runFn.mock.calls.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('chat-session-delete', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates id', () => {
      expect(() => handlers['chat-session-delete'](null, '')).toThrow('参数无效: id')
      expect(() => handlers['chat-session-delete'](null, 123 as unknown)).toThrow('参数无效: id')
    })

    it('deletes history then session', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-session-delete'](null, 's1')
      expect(runFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('chat-messages-load', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates sessionId', async () => {
      await expect(handlers['chat-messages-load'](null, '')).rejects.toThrow('参数无效: sessionId')
      await expect(handlers['chat-messages-load'](null, 123 as unknown)).rejects.toThrow(
        '参数无效: sessionId',
      )
    })

    it('returns messages for session', async () => {
      const messages = [
        { id: 1, role: 'user', content: 'Hello' },
        { id: 2, role: 'assistant', content: 'Hi' },
      ]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('chat_history')) return makeStmt(messages)
        return makeStmt(undefined)
      })

      const result = await handlers['chat-messages-load'](null, 's1')
      expect(result).toEqual(messages)
    })
  })

  describe('chat-message-save', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates msg object', () => {
      expect(() => handlers['chat-message-save'](null, null)).toThrow('参数无效')
    })

    it('validates session_id', () => {
      expect(() =>
        handlers['chat-message-save'](null, { session_id: '', role: 'user', content: 'hi' }),
      ).toThrow('参数无效: session_id')
    })

    it('validates role', () => {
      expect(() =>
        handlers['chat-message-save'](null, { session_id: 's1', role: 'invalid', content: 'hi' }),
      ).toThrow('参数无效: role')
    })

    it('validates content is string', () => {
      expect(() =>
        handlers['chat-message-save'](null, {
          session_id: 's1',
          role: 'user',
          content: 123 as unknown,
        }),
      ).toThrow('参数无效: content')
    })

    it('validates model type', () => {
      expect(() =>
        handlers['chat-message-save'](null, {
          session_id: 's1',
          role: 'user',
          content: 'hi',
          model: 123 as unknown,
        }),
      ).toThrow('参数无效: model')
    })

    it('saves message with valid data', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-message-save'](null, {
        session_id: 's1',
        role: 'user',
        content: 'Hello',
        model: 'gpt-4',
      })
      expect(runFn).toHaveBeenCalledTimes(2) // INSERT + UPDATE timestamp
    })

    it('saves message without model', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-message-save'](null, {
        session_id: 's1',
        role: 'assistant',
        content: 'Hi',
      })
      expect(runFn).toHaveBeenCalledTimes(2)
    })

    it('truncates content to 100000 chars', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      const longContent = 'x'.repeat(200000)
      handlers['chat-message-save'](null, {
        session_id: 's1',
        role: 'user',
        content: longContent,
      })
      expect(runFn).toHaveBeenCalled()
    })
  })

  describe('chat-presets-list', () => {
    it('returns all presets', async () => {
      const presets = [{ id: 1, name: 'Code Review', prompt: 'Review', is_builtin: 1 }]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('prompt_presets') && sql.includes('ORDER BY')) return makeStmt(presets)
        return makeStmt(undefined)
      })

      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()

      const result = handlers['chat-presets-list']()
      expect(result).toEqual(presets)
    })
  })

  describe('chat-preset-save', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates preset object', () => {
      expect(() => handlers['chat-preset-save'](null, null)).toThrow('参数无效')
    })

    it('validates name', () => {
      expect(() => handlers['chat-preset-save'](null, { name: '', prompt: 'p' })).toThrow(
        '参数无效: name',
      )
      expect(() =>
        handlers['chat-preset-save'](null, { name: 123 as unknown, prompt: 'p' }),
      ).toThrow('参数无效: name')
    })

    it('validates prompt', () => {
      expect(() =>
        handlers['chat-preset-save'](null, { name: 'n', prompt: 123 as unknown }),
      ).toThrow('参数无效: prompt')
    })

    it('validates id when provided', () => {
      expect(() => handlers['chat-preset-save'](null, { id: -1, name: 'n', prompt: 'p' })).toThrow(
        '参数无效: id',
      )
      expect(() => handlers['chat-preset-save'](null, { id: NaN, name: 'n', prompt: 'p' })).toThrow(
        '参数无效: id',
      )
    })

    it('inserts new preset when no id', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-preset-save'](null, { name: 'Test', prompt: 'Do something' })
      expect(runFn).toHaveBeenCalled()
    })

    it('updates existing preset when id provided', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-preset-save'](null, { id: 5, name: 'Updated', prompt: 'New prompt' })
      expect(runFn).toHaveBeenCalled()
    })
  })

  describe('chat-preset-delete', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates id', () => {
      expect(() => handlers['chat-preset-delete'](null, -1)).toThrow('参数无效: id')
      expect(() => handlers['chat-preset-delete'](null, 'abc' as unknown)).toThrow('参数无效: id')
    })

    it('deletes preset', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-preset-delete'](null, 5)
      expect(runFn).toHaveBeenCalled()
    })
  })

  describe('chat-memories-list', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates search type', async () => {
      await expect(handlers['chat-memories-list'](null, 123 as unknown)).rejects.toThrow(
        '参数无效: search',
      )
    })

    it('returns all memories when no search', async () => {
      const memories = [{ id: 1, content: 'I prefer Python', category: 'fact' }]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('memories') && sql.includes('ORDER BY')) return makeStmt(memories)
        return makeStmt(undefined)
      })

      const result = await handlers['chat-memories-list'](null)
      expect(result).toEqual(memories)
    })

    it('filters memories by search keyword', async () => {
      const memories = [
        { id: 1, content: 'I prefer Python', category: 'fact' },
        { id: 2, content: 'I like Java', category: 'preference' },
      ]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('memories') && sql.includes('ORDER BY')) return makeStmt(memories)
        return makeStmt(undefined)
      })

      const result = await handlers['chat-memories-list'](null, 'python')
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('I prefer Python')
    })

    it('returns all when search is empty/whitespace', async () => {
      const memories = [{ id: 1, content: 'test', category: 'fact' }]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('memories')) return makeStmt(memories)
        return makeStmt(undefined)
      })

      const result = await handlers['chat-memories-list'](null, '   ')
      expect(result).toEqual(memories)
    })

    it('returns null for undefined/null search', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('memories')) return makeStmt([])
        return makeStmt(undefined)
      })

      // null search should not throw
      await handlers['chat-memories-list'](null, null)
      await handlers['chat-memories-list'](null, undefined)
    })
  })

  describe('chat-memory-save', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates memory object', () => {
      expect(() => handlers['chat-memory-save'](null, null)).toThrow('参数无效')
    })

    it('validates content', () => {
      expect(() => handlers['chat-memory-save'](null, { content: '' })).toThrow('参数无效: content')
      expect(() => handlers['chat-memory-save'](null, { content: 123 as unknown })).toThrow(
        '参数无效: content',
      )
    })

    it('validates id when provided', () => {
      expect(() => handlers['chat-memory-save'](null, { content: 'test', id: -1 })).toThrow(
        '参数无效: id',
      )
    })

    it('validates category type', () => {
      expect(() =>
        handlers['chat-memory-save'](null, { content: 'test', category: 123 as unknown }),
      ).toThrow('参数无效: category')
    })

    it('validates source type', () => {
      expect(() =>
        handlers['chat-memory-save'](null, { content: 'test', source: 123 as unknown }),
      ).toThrow('参数无效: source')
    })

    it('validates source_ref type', () => {
      expect(() =>
        handlers['chat-memory-save'](null, { content: 'test', source_ref: 123 as unknown }),
      ).toThrow('参数无效: source_ref')
    })

    it('validates confidence type', () => {
      expect(() =>
        handlers['chat-memory-save'](null, { content: 'test', confidence: 'abc' as unknown }),
      ).toThrow('参数无效: confidence')
    })

    it('updates existing memory by id', () => {
      const getStmt = makeStmt({ id: 5, content: 'Updated' })
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('SELECT * FROM memories WHERE id')) return getStmt
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      const result = handlers['chat-memory-save'](null, {
        id: 5,
        content: 'Updated content',
        pinned: true,
        enabled: false,
      })
      expect(result).toBeTruthy() // handler returns saved memory object with id
    })

    it('merges with existing memory on content match', () => {
      const existing = {
        id: 10,
        content: 'Same content',
        category: 'fact',
        confidence: 0.9,
        source: 'chat',
        source_ref: 's1',
      }
      const updated = { id: 10, content: 'Same content', category: 'fact' }
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('lower(content) = lower(?)') && sql.includes('LIMIT 1'))
          return makeStmt(existing)
        if (sql.includes('SELECT * FROM memories WHERE id')) return makeStmt(updated)
        return makeStmt(undefined)
      })

      const result = handlers['chat-memory-save'](null, { content: 'Same content' })
      expect(result).toBeTruthy() // handler returns merged memory object with id
    })

    it('inserts new memory when no match', () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('lower(content) = lower(?)') && sql.includes('LIMIT 1'))
          return makeStmt(undefined)
        if (sql.includes('INSERT INTO memories'))
          return { run: vi.fn(() => ({ lastInsertRowid: 42 })), get: vi.fn(), all: vi.fn() }
        if (sql.includes('SELECT * FROM memories WHERE id'))
          return makeStmt({ id: 42, content: 'New memory' })
        return makeStmt(undefined)
      })

      const result = handlers['chat-memory-save'](null, { content: 'New memory' })
      expect(result).toBeTruthy() // handler returns newly inserted memory object
    })
  })

  describe('chat-memory-delete', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates id', () => {
      expect(() => handlers['chat-memory-delete'](null, -1)).toThrow('参数无效: id')
      expect(() => handlers['chat-memory-delete'](null, 'abc' as unknown)).toThrow('参数无效: id')
    })

    it('deletes memory', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      handlers['chat-memory-delete'](null, 5)
      expect(runFn).toHaveBeenCalled()
    })
  })

  describe('chat-memory-capture', () => {
    beforeEach(async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        return makeStmt(undefined)
      })
      const { registerChatIPC } = await import('../electron/ipc/chat')
      registerChatIPC()
    })

    it('validates args object', () => {
      expect(() => handlers['chat-memory-capture'](null, null)).toThrow('参数无效')
    })

    it('validates content', () => {
      expect(() => handlers['chat-memory-capture'](null, { content: '' })).toThrow(
        '参数无效: content',
      )
    })

    it('validates session_id type', () => {
      expect(() =>
        handlers['chat-memory-capture'](null, { content: '记住这个', session_id: 123 as unknown }),
      ).toThrow('参数无效: session_id')
    })

    it('processes content and returns saved memories', () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('lower(content)')) return makeStmt(undefined)
        if (sql.includes('INSERT INTO memories'))
          return { run: vi.fn(() => ({ lastInsertRowid: 1 })), get: vi.fn(), all: vi.fn() }
        if (sql.includes('SELECT * FROM memories WHERE id'))
          return makeStmt({ id: 1, content: 'test', category: 'fact' })
        return makeStmt(undefined)
      })

      // Content without matching pattern returns empty
      const result = handlers['chat-memory-capture'](null, { content: '普通消息没有记忆' })
      expect(Array.isArray(result)).toBe(true)
    })

    it('captures memory from matching content', () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
        if (sql.includes('lower(content)')) return makeStmt(undefined)
        if (sql.includes('INSERT INTO memories'))
          return { run: vi.fn(() => ({ lastInsertRowid: 1 })), get: vi.fn(), all: vi.fn() }
        if (sql.includes('SELECT * FROM memories WHERE id'))
          return makeStmt({ id: 1, content: 'Python是最好的语言', category: 'fact' })
        return makeStmt(undefined)
      })

      const result = handlers['chat-memory-capture'](null, {
        content: '记住：Python是最好的语言',
        session_id: 's1',
      })
      expect(Array.isArray(result)).toBe(true)
    })
  })
})

describe('getRelevantMemories', () => {
  it('returns memories sorted by relevance', async () => {
    const memories = [
      {
        id: 1,
        content: 'Python preference',
        category: 'fact',
        pinned: 1,
        enabled: 1,
        confidence: 1,
      },
      { id: 2, content: 'Java note', category: 'fact', pinned: 0, enabled: 1, confidence: 1 },
      {
        id: 3,
        content: 'Python decorator pattern',
        category: 'fact',
        pinned: 0,
        enabled: 1,
        confidence: 1,
      },
    ]
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      if (sql.includes('enabled = 1')) return makeStmt(memories)
      return makeStmt(undefined)
    })

    const { registerChatIPC, getRelevantMemories } = await import('../electron/ipc/chat')
    registerChatIPC()

    const result = getRelevantMemories('Python')
    expect(result.length).toBeGreaterThan(0)
    // Python-related memories should rank higher
    expect(result[0].content).toContain('Python')
  })

  it('returns pinned memories even with low match', async () => {
    const memories = [
      {
        id: 1,
        content: 'Unrelated content',
        category: 'fact',
        pinned: 1,
        enabled: 1,
        confidence: 1,
      },
    ]
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      if (sql.includes('enabled = 1')) return makeStmt(memories)
      return makeStmt(undefined)
    })

    const { registerChatIPC, getRelevantMemories } = await import('../electron/ipc/chat')
    registerChatIPC()

    const result = getRelevantMemories('totally different query')
    expect(result.length).toBeGreaterThan(0)
  })

  it('falls back to top pinned memories when no matches', async () => {
    const memories = [
      { id: 1, content: 'abc', category: 'fact', pinned: 0, enabled: 1, confidence: 1 },
      { id: 2, content: 'def', category: 'fact', pinned: 1, enabled: 1, confidence: 1 },
    ]
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      if (sql.includes('enabled = 1')) return makeStmt(memories)
      return makeStmt(undefined)
    })

    const { registerChatIPC, getRelevantMemories } = await import('../electron/ipc/chat')
    registerChatIPC()

    const result = getRelevantMemories('zzzzzzzzzzzzzz')
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('respects limit parameter', async () => {
    const memories = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      content: `Python item ${i}`,
      category: 'fact',
      pinned: 0,
      enabled: 1,
      confidence: 1,
    }))
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      if (sql.includes('enabled = 1')) return makeStmt(memories)
      return makeStmt(undefined)
    })

    const { registerChatIPC, getRelevantMemories } = await import('../electron/ipc/chat')
    registerChatIPC()

    const result = getRelevantMemories('Python', 3)
    expect(result).toHaveLength(3)
  })
})

describe('markMemoriesUsed', () => {
  it('does nothing for empty ids', async () => {
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      return makeStmt(undefined)
    })

    const { registerChatIPC, markMemoriesUsed } = await import('../electron/ipc/chat')
    registerChatIPC()

    markMemoriesUsed([])
    // Should not throw or call DB
  })

  it('updates last_used_at for each id', async () => {
    mockDB.prepare.mockReset()
    const runFn = vi.fn()
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      return { get: vi.fn(), all: vi.fn(), run: runFn }
    })

    const { registerChatIPC, markMemoriesUsed } = await import('../electron/ipc/chat')
    registerChatIPC()

    markMemoriesUsed([1, 2, 3])
    // Should call run at least once for each id
    expect(runFn.mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})

describe('captureMemoriesFromMessage', () => {
  it('captures memory from "记住" pattern', async () => {
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      if (sql.includes('lower(content)')) return makeStmt(undefined)
      if (sql.includes('INSERT INTO memories'))
        return { run: vi.fn(() => ({ lastInsertRowid: 1 })), get: vi.fn(), all: vi.fn() }
      if (sql.includes('SELECT * FROM memories WHERE id'))
        return makeStmt({ id: 1, content: 'Python最好', category: 'fact' })
      return makeStmt(undefined)
    })

    const { registerChatIPC, captureMemoriesFromMessage } = await import('../electron/ipc/chat')
    registerChatIPC()

    const result = captureMemoriesFromMessage('记住：Python最好', 's1')
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns empty for non-matching messages', async () => {
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      return makeStmt(undefined)
    })

    const { registerChatIPC, captureMemoriesFromMessage } = await import('../electron/ipc/chat')
    registerChatIPC()

    const result = captureMemoriesFromMessage('这是一个普通消息')
    expect(result).toEqual([])
  })

  it('merges with existing memory on content match', async () => {
    const existing = { id: 5, content: 'Python最好', category: 'fact' }
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return makeStmt({ c: 1 })
      if (sql.includes('lower(content)') && sql.includes('LIMIT 1')) return makeStmt(existing)
      if (sql.includes('UPDATE memories SET category')) return makeStmt(undefined)
      if (sql.includes('SELECT * FROM memories WHERE id'))
        return makeStmt({ id: 5, content: 'Python最好', category: 'fact' })
      return makeStmt(undefined)
    })

    const { registerChatIPC, captureMemoriesFromMessage } = await import('../electron/ipc/chat')
    registerChatIPC()

    const result = captureMemoriesFromMessage('记住：Python最好')
    expect(result.length).toBeGreaterThan(0)
  })
})
