import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// Collect registered handlers
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({
      webContents: { send: vi.fn() },
    })),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString()),
  },
  app: {
    getPath: vi.fn(() => '/tmp/test-user-data'),
  },
}))

// Mock better-sqlite3 via db/index
const mockDB = {
  prepare: vi.fn(),
  exec: vi.fn(),
  pragma: vi.fn(),
  close: vi.fn(),
  transaction: vi.fn((fn: () => void) => {
    return () => fn()
  }),
}

vi.mock('../electron/db/index', () => ({
  getDB: () => mockDB,
  closeDB: () => {},
}))

// Mock fs for problem sync
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => ''),
    statSync: vi.fn(() => ({ size: 100 })),
  }
})

// Mock codeRunner
vi.mock('../electron/utils/codeRunner', () => ({
  runCodeSnippet: vi.fn(),
}))

function makeStmt(result: unknown = undefined) {
  const stmt = {
    get: vi.fn(() => result),
    all: vi.fn(() => (Array.isArray(result) ? result : [result])),
    run: vi.fn(() => ({ lastInsertRowid: 1 })),
  }
  return stmt
}

function setupDB(preparedResults: Record<string, unknown> = {}) {
  mockDB.prepare.mockImplementation((sql: string) => {
    const key = Object.keys(preparedResults).find((k) => sql.includes(k))
    if (key) return makeStmt(preparedResults[key])
    return makeStmt(undefined)
  })
}

describe('registerMistakesIPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
    mockDB.exec.mockReset()
  })

  it('registers mistakes handlers', async () => {
    setupDB({ mistakes: [] })
    const { registerMistakesIPC } = await import('../electron/ipc/mistakes')
    registerMistakesIPC()

    expect(handlers['mistakes-list']).toBeDefined() // IPC handler registration
    expect(handlers['mistakes-get']).toBeDefined()
    expect(handlers['mistakes-update-analysis']).toBeDefined()
    expect(handlers['mistakes-delete']).toBeDefined()
  })

  it('mistakes-list calls DB', async () => {
    const mockRows = [{ id: 1, problem_id: 1, title: 'Test' }]
    setupDB({ mistakes: mockRows })
    const { registerMistakesIPC } = await import('../electron/ipc/mistakes')
    registerMistakesIPC()

    const result = handlers['mistakes-list']()
    expect(result).toEqual(mockRows)
  })

  it('mistakes-get validates id', async () => {
    setupDB({})
    const { registerMistakesIPC } = await import('../electron/ipc/mistakes')
    registerMistakesIPC()

    expect(() => handlers['mistakes-get'](null, -1)).toThrow('参数无效: id')
    expect(() => handlers['mistakes-get'](null, NaN)).toThrow('参数无效: id')
  })

  it('mistakes-get returns mistake by id', async () => {
    const mockMistake = { id: 1, problem_id: 1, title: 'Test', description: 'Desc' }
    setupDB({ mistakes: mockMistake })
    const { registerMistakesIPC } = await import('../electron/ipc/mistakes')
    registerMistakesIPC()

    const result = handlers['mistakes-get'](null, 1)
    expect(result).toEqual(mockMistake)
  })

  it('mistakes-update-analysis validates inputs', async () => {
    setupDB({})
    const { registerMistakesIPC } = await import('../electron/ipc/mistakes')
    registerMistakesIPC()

    expect(() => handlers['mistakes-update-analysis'](null, -1, 'analysis')).toThrow('参数无效: id')
    expect(() => handlers['mistakes-update-analysis'](null, 1, 123 as unknown)).toThrow(
      '参数无效: analysis',
    )
  })

  it('mistakes-update-analysis truncates long analysis', async () => {
    const mockRun = vi.fn()
    mockDB.prepare.mockReturnValue({ run: mockRun, get: vi.fn(), all: vi.fn() })
    const { registerMistakesIPC } = await import('../electron/ipc/mistakes')
    registerMistakesIPC()

    const longAnalysis = 'x'.repeat(60000)
    handlers['mistakes-update-analysis'](null, 1, longAnalysis)

    expect(mockRun).toHaveBeenCalledWith('x'.repeat(50000), 1)
  })

  it('mistakes-delete validates id', async () => {
    setupDB({})
    const { registerMistakesIPC } = await import('../electron/ipc/mistakes')
    registerMistakesIPC()

    expect(() => handlers['mistakes-delete'](null, 0)).toThrow('参数无效: id')
  })
})

describe('registerRunnerIPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
  })

  it('registers run-code handler', async () => {
    const { registerRunnerIPC } = await import('../electron/ipc/runner')
    registerRunnerIPC()
    expect(handlers['run-code']).toBeDefined() // IPC handler registration
  })

  it('validates args object', async () => {
    const { registerRunnerIPC } = await import('../electron/ipc/runner')
    registerRunnerIPC()

    await expect(handlers['run-code'](null, null)).rejects.toThrow('参数无效')
    await expect(handlers['run-code'](null, 'not-object')).rejects.toThrow('参数无效')
  })

  it('validates code is string', async () => {
    const { registerRunnerIPC } = await import('../electron/ipc/runner')
    registerRunnerIPC()

    await expect(handlers['run-code'](null, { code: 123, language: 'python' })).rejects.toThrow(
      '参数无效: code',
    )
  })

  it('validates language is non-empty string', async () => {
    const { registerRunnerIPC } = await import('../electron/ipc/runner')
    registerRunnerIPC()

    await expect(handlers['run-code'](null, { code: 'x', language: '' })).rejects.toThrow(
      '参数无效: language',
    )
  })

  it('validates stdin type', async () => {
    const { registerRunnerIPC } = await import('../electron/ipc/runner')
    registerRunnerIPC()

    await expect(
      handlers['run-code'](null, { code: 'x', language: 'python', stdin: 123 }),
    ).rejects.toThrow('参数无效: stdin')
  })

  it('delegates to runCodeSnippet with valid args', async () => {
    const { runCodeSnippet } = await import('../electron/utils/codeRunner')
    ;(runCodeSnippet as Mock).mockResolvedValueOnce({ stdout: 'hello', stderr: '', exitCode: 0 })

    const { registerRunnerIPC } = await import('../electron/ipc/runner')
    registerRunnerIPC()

    const result = await handlers['run-code'](null, { code: 'print("hello")', language: 'python' })
    expect(result).toEqual({ stdout: 'hello', stderr: '', exitCode: 0 })
    expect(runCodeSnippet).toHaveBeenCalledWith('print("hello")', 'python', undefined)
  })
})

describe('registerDatabaseIPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
  })

  it('registers all database handlers', async () => {
    setupDB({})
    const { registerDatabaseIPC } = await import('../electron/ipc/database')
    registerDatabaseIPC()

    expect(handlers['db-get-setting']).toBeDefined() // IPC handler registration
    expect(handlers['db-set-setting']).toBeDefined()
    expect(handlers['db-get-ai-configs']).toBeDefined()
    expect(handlers['db-save-ai-config']).toBeDefined()
    expect(handlers['db-delete-ai-config']).toBeDefined()
    expect(handlers['db-get-default-ai-config']).toBeDefined()
    expect(handlers['ai-fetch-models']).toBeDefined()
  })

  describe('db-get-setting', () => {
    it('validates key', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      expect(() => handlers['db-get-setting'](null, '')).toThrow('参数无效: key')
      expect(() => handlers['db-get-setting'](null, 123 as unknown)).toThrow('参数无效: key')
    })

    it('returns setting value', async () => {
      mockDB.prepare.mockReturnValue({
        get: vi.fn(() => ({ value: 'mocha' })),
        all: vi.fn(),
        run: vi.fn(),
      })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = handlers['db-get-setting'](null, 'ui-theme')
      expect(result).toBe('mocha')
    })

    it('returns null when setting not found', async () => {
      mockDB.prepare.mockReturnValue({
        get: vi.fn(() => undefined),
        all: vi.fn(),
        run: vi.fn(),
      })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = handlers['db-get-setting'](null, 'nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('db-set-setting', () => {
    it('validates inputs', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      expect(() => handlers['db-set-setting'](null, '', 'val')).toThrow('参数无效: key')
      expect(() => handlers['db-set-setting'](null, 'key', 123 as unknown)).toThrow(
        '参数无效: value',
      )
    })

    it('saves setting', async () => {
      const mockRun = vi.fn()
      mockDB.prepare.mockReturnValue({ run: mockRun, get: vi.fn(), all: vi.fn() })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      handlers['db-set-setting'](null, 'ui-theme', 'fjord')
      expect(mockRun).toHaveBeenCalledWith('ui-theme', 'fjord')
    })
  })

  describe('db-get-ai-configs', () => {
    it('returns decrypted configs', async () => {
      mockDB.prepare.mockReturnValue({
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 1,
            name: 'GPT',
            api_key: 'sk-xxx',
            base_url: 'https://api.openai.com',
            model: 'gpt-4',
            is_default: 1,
            task_type: null,
          },
        ]),
        run: vi.fn(),
      })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = await handlers['db-get-ai-configs']()
      expect(result).toHaveLength(1)
      expect(result[0].api_key).toBe('sk-xxx')
    })
  })

  describe('db-save-ai-config', () => {
    it('validates config object', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      expect(() => handlers['db-save-ai-config'](null, null)).toThrow('参数无效: config')
      expect(() =>
        handlers['db-save-ai-config'](null, { name: '', api_key: 'k', base_url: 'u', model: 'm' }),
      ).toThrow('参数无效: name')
      expect(() =>
        handlers['db-save-ai-config'](null, {
          name: 'n',
          api_key: 123 as unknown,
          base_url: 'u',
          model: 'm',
        }),
      ).toThrow('参数无效: api_key')
      expect(() =>
        handlers['db-save-ai-config'](null, { name: 'n', api_key: 'k', base_url: '', model: 'm' }),
      ).toThrow('参数无效: base_url')
      expect(() =>
        handlers['db-save-ai-config'](null, { name: 'n', api_key: 'k', base_url: 'u', model: '' }),
      ).toThrow('参数无效: model')
    })

    it('inserts new config', async () => {
      const mockRun = vi.fn(() => ({ lastInsertRowid: 5 }))
      mockDB.prepare.mockReturnValue({ run: mockRun, get: vi.fn(), all: vi.fn() })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = handlers['db-save-ai-config'](null, {
        name: 'Claude',
        api_key: 'sk-ant',
        base_url: 'https://api.anthropic.com',
        model: 'claude-3',
        is_default: false,
      })
      expect(result).toBe(5)
    })

    it('updates existing config when id provided', async () => {
      const mockRun = vi.fn()
      mockDB.prepare.mockReturnValue({ run: mockRun, get: vi.fn(), all: vi.fn() })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = handlers['db-save-ai-config'](null, {
        id: 3,
        name: 'Updated',
        api_key: 'sk-new',
        base_url: 'https://api.new.com',
        model: 'new-model',
        is_default: true,
      })
      expect(result).toBe(3)
    })
  })

  describe('db-delete-ai-config', () => {
    it('validates id', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      expect(() => handlers['db-delete-ai-config'](null, 0)).toThrow('参数无效: id')
      expect(() => handlers['db-delete-ai-config'](null, -1)).toThrow('参数无效: id')
    })
  })

  describe('db-get-default-ai-config', () => {
    it('returns default config', async () => {
      const defaultConfig = {
        id: 1,
        name: 'Default',
        api_key: 'sk-xxx',
        base_url: 'url',
        model: 'm',
        is_default: 1,
        task_type: null,
      }
      mockDB.prepare.mockReturnValue({
        get: vi.fn(() => defaultConfig),
        all: vi.fn(),
        run: vi.fn(),
      })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = handlers['db-get-default-ai-config']()
      expect(result).toBeTruthy() // returns the default config object
      expect(result.name).toBe('Default')
    })

    it('falls back to first config when no default', async () => {
      let callCount = 0
      mockDB.prepare.mockReturnValue({
        get: vi.fn(() => {
          callCount++
          // First call (WHERE is_default=1) returns undefined
          // Second call (LIMIT 1) returns a config
          if (callCount <= 1) return undefined
          return {
            id: 2,
            name: 'Fallback',
            api_key: 'sk-fb',
            base_url: 'url',
            model: 'm',
            is_default: 0,
            task_type: null,
          }
        }),
        all: vi.fn(),
        run: vi.fn(),
      })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = handlers['db-get-default-ai-config']()
      expect(result).toBeTruthy() // falls back to first available config
    })

    it('returns null when no configs exist', async () => {
      mockDB.prepare.mockReturnValue({
        get: vi.fn(() => undefined),
        all: vi.fn(),
        run: vi.fn(),
      })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = handlers['db-get-default-ai-config']()
      expect(result).toBeNull()
    })
  })

  describe('db-delete-ai-config', () => {
    it('validates id', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      expect(() => handlers['db-delete-ai-config'](null, 0)).toThrow('参数无效: id')
      expect(() => handlers['db-delete-ai-config'](null, -1)).toThrow('参数无效: id')
    })

    it('deletes config with valid id', async () => {
      const mockRun = vi.fn()
      mockDB.prepare.mockReturnValue({ run: mockRun, get: vi.fn(), all: vi.fn() })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      handlers['db-delete-ai-config'](null, 5)
      expect(mockRun).toHaveBeenCalled()
    })
  })

  describe('ai-fetch-models', () => {
    it('validates args object', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      await expect(handlers['ai-fetch-models'](null, null)).rejects.toThrow('参数无效')
    })

    it('validates api_key', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      await expect(
        handlers['ai-fetch-models'](null, { api_key: '', base_url: 'http://api.test' }),
      ).rejects.toThrow('参数无效: api_key')
    })

    it('validates base_url', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      await expect(
        handlers['ai-fetch-models'](null, { api_key: 'sk-test', base_url: '' }),
      ).rejects.toThrow('参数无效: base_url')
    })

    it('fetches and returns sorted model list', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'claude-3' }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await handlers['ai-fetch-models'](null, {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
      })
      expect(result).toEqual(['claude-3', 'gpt-3.5-turbo', 'gpt-4'])
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({ headers: { Authorization: 'Bearer sk-test' } }),
      )

      vi.unstubAllGlobals()
    })

    it('throws on non-ok response', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(
        handlers['ai-fetch-models'](null, { api_key: 'bad', base_url: 'https://api.test' }),
      ).rejects.toThrow('获取模型列表失败 (401)')

      vi.unstubAllGlobals()
    })

    it('strips trailing slash from base_url', async () => {
      setupDB({})
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await handlers['ai-fetch-models'](null, {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1/',
      })
      expect(mockFetch).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.anything())

      vi.unstubAllGlobals()
    })
  })

  describe('encryption handling', () => {
    it('encrypts api key when encryption is available', async () => {
      const electron = await import('electron')
      const origIsEncryption = electron.safeStorage.isEncryptionAvailable as ReturnType<
        typeof vi.fn
      >
      origIsEncryption.mockReturnValue(true)
      ;(electron.safeStorage.encryptString as ReturnType<typeof vi.fn>).mockReturnValue(
        Buffer.from('encrypted-key'),
      )

      const mockRun = vi.fn(() => ({ lastInsertRowid: 1 }))
      mockDB.prepare.mockReturnValue({ run: mockRun, get: vi.fn(), all: vi.fn() })

      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      handlers['db-save-ai-config'](null, {
        name: 'Encrypted',
        api_key: 'sk-secret',
        base_url: 'https://api.test',
        model: 'gpt-4',
      })

      expect(electron.safeStorage.encryptString).toHaveBeenCalledWith('sk-secret')
      origIsEncryption.mockReturnValue(false)
    })

    it('decrypts encrypted api key on read', async () => {
      const electron = await import('electron')
      ;(electron.safeStorage.decryptString as ReturnType<typeof vi.fn>).mockReturnValue(
        'my-decrypted-key',
      )

      mockDB.prepare.mockReturnValue({
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 1,
            name: 'Test',
            api_key: 'enc:ZW5jcnlwdGVk',
            base_url: 'url',
            model: 'm',
            is_default: 1,
            task_type: null,
          },
        ]),
        run: vi.fn(),
      })

      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = await handlers['db-get-ai-configs']()
      expect(result[0].api_key).toBe('my-decrypted-key')
    })

    it('returns empty string when decryption fails', async () => {
      const electron = await import('electron')
      ;(electron.safeStorage.decryptString as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('decryption failed')
      })

      mockDB.prepare.mockReturnValue({
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 1,
            name: 'Test',
            api_key: 'enc:bad-data',
            base_url: 'url',
            model: 'm',
            is_default: 1,
            task_type: null,
          },
        ]),
        run: vi.fn(),
      })

      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = await handlers['db-get-ai-configs']()
      expect(result[0].api_key).toBe('')
    })

    it('passes through non-encrypted api key', async () => {
      mockDB.prepare.mockReturnValue({
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 1,
            name: 'Test',
            api_key: 'sk-plain-key',
            base_url: 'url',
            model: 'm',
            is_default: 1,
            task_type: null,
          },
        ]),
        run: vi.fn(),
      })

      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = await handlers['db-get-ai-configs']()
      expect(result[0].api_key).toBe('sk-plain-key')
    })
  })

  describe('db-save-ai-config with task_type', () => {
    it('saves config with task_type', async () => {
      const mockRun = vi.fn(() => ({ lastInsertRowid: 5 }))
      mockDB.prepare.mockReturnValue({ run: mockRun, get: vi.fn(), all: vi.fn() })
      const { registerDatabaseIPC } = await import('../electron/ipc/database')
      registerDatabaseIPC()

      const result = handlers['db-save-ai-config'](null, {
        name: 'Chat Config',
        api_key: 'sk-test',
        base_url: 'https://api.test',
        model: 'gpt-4',
        task_type: 'chat',
      })
      expect(result).toBe(5)
    })
  })
})

describe('registerRunnerIPC - stdin handling', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
  })

  it('passes stdin to runCodeSnippet', async () => {
    const { runCodeSnippet } = await import('../electron/utils/codeRunner')
    ;(runCodeSnippet as Mock).mockResolvedValueOnce({
      stdout: 'hello stdin',
      stderr: '',
      exitCode: 0,
    })

    const { registerRunnerIPC } = await import('../electron/ipc/runner')
    registerRunnerIPC()

    const result = await handlers['run-code'](null, {
      code: 'import sys; print(sys.stdin.read())',
      language: 'python',
      stdin: 'hello stdin',
    })
    expect(result).toEqual({ stdout: 'hello stdin', stderr: '', exitCode: 0 })
    expect(runCodeSnippet).toHaveBeenCalledWith(
      'import sys; print(sys.stdin.read())',
      'python',
      'hello stdin',
    )
  })
})
