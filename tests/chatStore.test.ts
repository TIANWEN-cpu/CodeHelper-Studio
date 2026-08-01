import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

const { useChatStore } = await import('../src/stores/chatStore')

const emptyRAGContext = {
  recentProblems: [],
  learningHistory: [],
  knowledgeChunks: [],
  userProfile: { preferredLanguage: '', difficultyLevel: '', strongTopics: [], weakTopics: [] },
}

beforeEach(() => {
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    messages: [],
    streaming: false,
    currentRequestId: null,
    error: null,
    presets: [],
    memories: [],
  })
  mockInvoke.mockReset()
})

describe('chatStore', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useChatStore.getState()
      expect(state.sessions).toEqual([])
      expect(state.activeSessionId).toBeNull()
      expect(state.messages).toEqual([])
      expect(state.streaming).toBe(false)
      expect(state.currentRequestId).toBeNull()
      expect(state.error).toBeNull()
      expect(state.presets).toEqual([])
      expect(state.memories).toEqual([])
    })
  })

  describe('loadSessions', () => {
    it('loads sessions from IPC', async () => {
      const mockSessions = [
        {
          id: 's1',
          title: 'Chat 1',
          system_prompt: '',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        {
          id: 's2',
          title: 'Chat 2',
          system_prompt: '',
          created_at: '2024-01-02',
          updated_at: '2024-01-02',
        },
      ]
      mockInvoke.mockResolvedValueOnce(mockSessions)

      await useChatStore.getState().loadSessions()

      expect(mockInvoke).toHaveBeenCalledWith('chat-sessions-list')
      expect(useChatStore.getState().sessions).toEqual(mockSessions)
    })
  })

  describe('createSession', () => {
    it('creates a session and switches to it', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-create
      mockInvoke.mockResolvedValueOnce([{ id: 'session-123', title: '新对话', system_prompt: '' }]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // chat-messages-load for switchSession

      const id = await useChatStore.getState().createSession()

      expect(id).toMatch(/^session-/)
      expect(mockInvoke).toHaveBeenCalledWith(
        'chat-session-create',
        expect.objectContaining({
          title: '新对话',
          system_prompt: '',
        }),
      )
    })

    it('passes custom system prompt and title', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([
        { id: 'session-456', title: 'Custom', system_prompt: 'You are helpful' },
      ])
      mockInvoke.mockResolvedValueOnce([])

      const _id = await useChatStore.getState().createSession('You are helpful', 'Custom')

      expect(mockInvoke).toHaveBeenCalledWith(
        'chat-session-create',
        expect.objectContaining({
          title: 'Custom',
          system_prompt: 'You are helpful',
        }),
      )
    })
  })

  describe('switchSession', () => {
    it('loads messages for the session', async () => {
      const mockRows = [
        { id: 1, role: 'user', content: 'Hello', created_at: '2024-01-01T00:00:00Z' },
        { id: 2, role: 'assistant', content: 'Hi there', created_at: '2024-01-01T00:00:01Z' },
      ]
      mockInvoke.mockResolvedValueOnce(mockRows)

      await useChatStore.getState().switchSession('s1')

      expect(mockInvoke).toHaveBeenCalledWith('chat-messages-load', 's1')
      const state = useChatStore.getState()
      expect(state.activeSessionId).toBe('s1')
      expect(state.messages).toHaveLength(2)
      expect(state.messages[0].role).toBe('user')
      expect(state.messages[0].content).toBe('Hello')
      expect(state.messages[1].role).toBe('assistant')
      expect(state.messages[1].content).toBe('Hi there')
      expect(state.error).toBeNull()
      expect(state.streaming).toBe(false)
      expect(state.currentRequestId).toBeNull()
    })

    it('ignores a stale load that finishes after a newer session switch', async () => {
      let resolveFirst:
        | ((messages: Array<{ id: string; role: string; content: string }>) => void)
        | null = null
      const firstLoad = new Promise<Array<{ id: string; role: string; content: string }>>(
        (resolve) => {
          resolveFirst = resolve
        },
      )
      mockInvoke
        .mockImplementationOnce(() => firstLoad)
        .mockResolvedValueOnce([{ id: 'b1', role: 'user', content: 'session B' }])

      const switchA = useChatStore.getState().switchSession('session-a')
      const switchB = useChatStore.getState().switchSession('session-b')
      await switchB
      resolveFirst?.([{ id: 'a1', role: 'user', content: 'session A' }])
      await switchA

      expect(useChatStore.getState().activeSessionId).toBe('session-b')
      expect(useChatStore.getState().messages).toEqual([
        { id: 'b1', role: 'user', content: 'session B' },
      ])
      expect(useChatStore.getState().loading).toBe(false)
    })
  })

  describe('deleteSession', () => {
    it('deletes session and switches to first remaining', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: 'Chat 1', system_prompt: '', created_at: '', updated_at: '' },
          { id: 's2', title: 'Chat 2', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-delete
      mockInvoke.mockResolvedValueOnce([
        { id: 's2', title: 'Chat 2', system_prompt: '', created_at: '', updated_at: '' },
      ]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // switchSession -> chat-messages-load

      await useChatStore.getState().deleteSession('s1')

      expect(mockInvoke).toHaveBeenCalledWith('chat-session-delete', 's1')
      expect(useChatStore.getState().activeSessionId).toBe('s2')
    })

    it('clears state when deleting the last session', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: 'Chat 1', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-delete
      mockInvoke.mockResolvedValueOnce([]) // loadSessions returns empty

      await useChatStore.getState().deleteSession('s1')

      const state = useChatStore.getState()
      expect(state.activeSessionId).toBeNull()
      expect(state.messages).toEqual([])
    })

    it('does not switch session when deleting non-active session', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: 'Chat 1', system_prompt: '', created_at: '', updated_at: '' },
          { id: 's2', title: 'Chat 2', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-delete
      mockInvoke.mockResolvedValueOnce([
        { id: 's1', title: 'Chat 1', system_prompt: '', created_at: '', updated_at: '' },
      ]) // loadSessions

      await useChatStore.getState().deleteSession('s2')

      expect(useChatStore.getState().activeSessionId).toBe('s1')
    })

    it('invalidates a pending switch to a session that is being deleted', async () => {
      let resolveLoad:
        | ((messages: Array<{ id: string; role: string; content: string }>) => void)
        | null = null
      const pendingLoad = new Promise<Array<{ id: string; role: string; content: string }>>(
        (resolve) => {
          resolveLoad = resolve
        },
      )
      useChatStore.setState({
        activeSessionId: 'session-a',
        sessions: [
          { id: 'session-a', title: 'A', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke
        .mockImplementationOnce(() => pendingLoad)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([])

      const switching = useChatStore.getState().switchSession('session-a')
      await useChatStore.getState().deleteSession('session-a')
      resolveLoad?.([{ id: 'late', role: 'user', content: 'stale' }])
      await switching

      expect(useChatStore.getState().activeSessionId).toBeNull()
      expect(useChatStore.getState().messages).toEqual([])
    })

    it('does not cancel a pending switch when an unrelated session is deleted', async () => {
      let resolveLoad:
        | ((messages: Array<{ id: string; role: string; content: string }>) => void)
        | null = null
      const pendingLoad = new Promise<Array<{ id: string; role: string; content: string }>>(
        (resolve) => {
          resolveLoad = resolve
        },
      )
      useChatStore.setState({
        activeSessionId: 'session-a',
        sessions: [
          { id: 'session-a', title: 'A', system_prompt: '', created_at: '', updated_at: '' },
          { id: 'session-b', title: 'B', system_prompt: '', created_at: '', updated_at: '' },
          { id: 'session-c', title: 'C', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke
        .mockImplementationOnce(() => pendingLoad)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([
          { id: 'session-a', title: 'A', system_prompt: '', created_at: '', updated_at: '' },
          { id: 'session-b', title: 'B', system_prompt: '', created_at: '', updated_at: '' },
        ])

      const switching = useChatStore.getState().switchSession('session-b')
      await useChatStore.getState().deleteSession('session-c')
      resolveLoad?.([{ id: 'b1', role: 'user', content: 'session B' }])
      await switching

      expect(useChatStore.getState().activeSessionId).toBe('session-b')
      expect(useChatStore.getState().messages).toEqual([
        { id: 'b1', role: 'user', content: 'session B' },
      ])
    })
  })

  describe('renameSession', () => {
    it('renames session and reloads', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-update
      mockInvoke.mockResolvedValueOnce([]) // loadSessions

      await useChatStore.getState().renameSession('s1', 'New Title')

      expect(mockInvoke).toHaveBeenCalledWith('chat-session-update', 's1', { title: 'New Title' })
    })
  })

  describe('sendMessage', () => {
    it('creates a new session if none active', async () => {
      useChatStore.setState({ activeSessionId: null, sessions: [] })
      // createSession calls
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-create
      mockInvoke.mockResolvedValueOnce([
        { id: 'session-new', title: '新对话', system_prompt: '', created_at: '', updated_at: '' },
      ]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // switchSession -> chat-messages-load
      // sendMessage calls
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save (user)
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce(undefined) // renameSession
      mockInvoke.mockResolvedValueOnce([]) // loadSessions for rename
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context (RAG enrichment)
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('Hello')

      expect(useChatStore.getState().messages).toHaveLength(2) // user + assistant placeholder
    })

    it('adds user and assistant messages to state', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: 'Existing', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context (RAG enrichment)
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('Test message')

      const state = useChatStore.getState()
      expect(state.messages).toHaveLength(2)
      expect(state.messages[0].role).toBe('user')
      expect(state.messages[0].content).toBe('Test message')
      expect(state.messages[1].role).toBe('assistant')
      expect(state.messages[1].content).toBe('')
      expect(state.streaming).toBe(true)
      expect(state.currentRequestId).toBeTruthy() // requestId is a runtime-generated UUID
    })

    it('auto-renames session with title "新对话', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: '新对话', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce(undefined) // renameSession (chat-session-update)
      mockInvoke.mockResolvedValueOnce([]) // loadSessions
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context (RAG enrichment)
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('What is Python?')

      expect(mockInvoke).toHaveBeenCalledWith('chat-session-update', 's1', {
        title: 'What is Python?',
      })
    })

    it('truncates auto-generated title at SESSION_TITLE_MAX_LENGTH', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: '新对话', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(42)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context (RAG enrichment)
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      const longMessage = 'A'.repeat(50)
      await useChatStore.getState().sendMessage(longMessage)

      expect(mockInvoke).toHaveBeenCalledWith('chat-session-update', 's1', {
        title: 'A'.repeat(30) + '...',
      })
    })

    it('handles sendMessage error', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: 'Existing', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context (RAG enrichment)
      mockInvoke.mockRejectedValueOnce(new Error('API error')) // ai-chat

      await useChatStore.getState().sendMessage('Hello')

      const state = useChatStore.getState()
      expect(state.error).toBe('API error')
      expect(state.streaming).toBe(false)
      expect(state.currentRequestId).toBeNull()
      // Last assistant message should contain the error
      const lastMsg = state.messages[state.messages.length - 1]
      expect(lastMsg.role).toBe('assistant')
      expect(lastMsg.content).toBe('API error')
    })

    it('includes system prompt in API messages', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          {
            id: 's1',
            title: 'Chat',
            system_prompt: 'You are a tutor',
            created_at: '',
            updated_at: '',
          },
        ],
      })
      mockInvoke.mockResolvedValueOnce(42)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context (RAG enrichment)
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      await useChatStore.getState().sendMessage('Hello')

      const aiChatCall = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'ai-chat')
      expect(aiChatCall).toBeTruthy() // dynamically generated call
      const payload = aiChatCall![1] as { messages: Array<{ role: string; content: string }> }
      expect(payload.messages[0]).toEqual({ role: 'system', content: 'You are a tutor' })
    })
  })

  describe('sendMessage options', () => {
    function seedSession() {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: 'Existing', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
    }

    it('sends sendOverride to the model but persists the raw content', async () => {
      seedSession()
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save (user)
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('hi', { sendOverride: '【上下文】\nhi' })

      // 入库与显示用原文
      expect(mockInvoke).toHaveBeenCalledWith('chat-message-save', {
        session_id: 's1',
        role: 'user',
        content: 'hi',
      })
      expect(useChatStore.getState().messages[0].content).toBe('hi')
      // 发给模型的是带前缀的覆盖文本
      const aiChatCall = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'ai-chat')
      const payload = aiChatCall![1] as {
        messages: Array<{ role: string; content: string }>
        currentUserMessageId: number
      }
      expect(payload.messages[payload.messages.length - 1]).toEqual({
        role: 'user',
        content: '【上下文】\nhi',
      })
      expect(payload.currentUserMessageId).toBe(42)
    })

    it('forwards includeMemories and memoryCategories to ai-chat', async () => {
      seedSession()
      mockInvoke.mockResolvedValueOnce(42)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce(emptyRAGContext)
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      await useChatStore
        .getState()
        .sendMessage('hi', { includeMemories: false, memoryCategories: ['tech', 'goal'] })

      const aiChatCall = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'ai-chat')
      const payload = aiChatCall![1] as { includeMemories: boolean; memoryCategories: string[] }
      expect(payload.includeMemories).toBe(false)
      expect(payload.memoryCategories).toEqual(['tech', 'goal'])
    })

    it('uses chat-memory-extract instead of capture when llmExtract is on', async () => {
      seedSession()
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-extract
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('记住我用 Rust', { llmExtract: true, configId: 3 })

      expect(mockInvoke).toHaveBeenCalledWith('chat-memory-extract', {
        content: '记住我用 Rust',
        configId: 3,
        sessionId: 's1',
      })
      expect(mockInvoke).not.toHaveBeenCalledWith('chat-memory-capture', expect.anything())
    })

    it('skips RAG retrieval when includeKnowledge is false', async () => {
      seedSession()
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('hi', { includeKnowledge: false })

      expect(mockInvoke).not.toHaveBeenCalledWith('knowledge-rag-context', expect.anything())
      const aiChatCall = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'ai-chat')
      expect((aiChatCall![1] as { ragContext: unknown }).ragContext).toBeUndefined()
    })

    it('does not write long-term memory for audited Agent model synthesis', async () => {
      seedSession()
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('agent goal', {
        captureMemory: false,
        includeKnowledge: false,
        includeMemories: false,
      })

      expect(mockInvoke).not.toHaveBeenCalledWith('chat-memory-capture', expect.anything())
      expect(mockInvoke).not.toHaveBeenCalledWith('chat-memory-extract', expect.anything())
      expect(mockInvoke).not.toHaveBeenCalledWith('knowledge-rag-context', expect.anything())
      expect(mockInvoke).toHaveBeenCalledWith('ai-chat', expect.anything())
    })

    it('cancels an Agent request before provider dispatch if message persistence is still pending', async () => {
      seedSession()
      let resolveSave!: (value: number) => void
      const savePending = new Promise<number>((resolve) => {
        resolveSave = resolve
      })
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'chat-message-save') return savePending
        if (channel === 'ai-chat-cancel') return Promise.resolve({ cancelled: false })
        return Promise.resolve(undefined)
      })

      const sendPending = useChatStore.getState().sendMessage('agent goal', {
        captureMemory: false,
        includeKnowledge: false,
        includeMemories: false,
      })
      expect(useChatStore.getState().currentRequestId).toBeTruthy()
      await useChatStore.getState().cancelCurrentRequest()
      resolveSave(42)
      await sendPending

      expect(mockInvoke).not.toHaveBeenCalledWith('ai-chat', expect.anything())
      // 取消未实际到达在途请求（cancelled: false）时不再显示"已取消"错误，
      // 只应静默结束本轮：无气泡、无错误横幅、退出流式态。
      expect(useChatStore.getState().error).toBe(null)
      expect(useChatStore.getState().streaming).toBe(false)
    })

    it('does not let an older cancelled request clear a newer stream', async () => {
      seedSession()
      let resolveFirstSave!: (value: number) => void
      const firstSave = new Promise<number>((resolve) => {
        resolveFirstSave = resolve
      })
      let saveCalls = 0
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'chat-message-save') {
          saveCalls += 1
          return saveCalls === 1 ? firstSave : Promise.resolve(43)
        }
        if (channel === 'ai-chat-cancel') return Promise.resolve({ cancelled: false })
        if (channel === 'ai-chat') {
          return Promise.resolve({ success: true, requestId: 'second', content: '' })
        }
        return Promise.resolve(undefined)
      })

      const firstSend = useChatStore.getState().sendMessage('first', {
        captureMemory: false,
        includeKnowledge: false,
        includeMemories: false,
      })
      await useChatStore.getState().cancelCurrentRequest()
      await useChatStore.getState().sendMessage('second', {
        captureMemory: false,
        includeKnowledge: false,
        includeMemories: false,
      })
      const newerRequestId = useChatStore.getState().currentRequestId
      expect(newerRequestId).toBeTruthy()
      expect(useChatStore.getState().streaming).toBe(true)

      resolveFirstSave(42)
      await firstSend

      const state = useChatStore.getState()
      expect(state.currentRequestId).toBe(newerRequestId)
      expect(state.streaming).toBe(true)
      expect(state.messages.filter((message) => message.role === 'assistant')).toHaveLength(1)
    })

    it('does not abort the turn when memory capture throws', async () => {
      seedSession()
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save
      mockInvoke.mockRejectedValueOnce(new Error('extract timeout')) // chat-memory-capture fails
      mockInvoke.mockResolvedValueOnce(emptyRAGContext) // knowledge-rag-context
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('hi')

      // 记忆失败被吞掉，对话仍然走到 ai-chat 且无错误
      expect(mockInvoke).toHaveBeenCalledWith('ai-chat', expect.anything())
      expect(useChatStore.getState().error).toBeNull()
    })
  })

  describe('normalizeChatSessions', () => {
    it('dedupes by id keeping first occurrence and drops id-less entries', async () => {
      const { normalizeChatSessions } = await import('../src/stores/chatStore')
      expect(
        normalizeChatSessions([
          { id: 'a', title: 'first' },
          { id: 'a', title: 'dupe' },
          { id: 'b', title: 'second' },
          { title: 'no id' },
        ]),
      ).toEqual([
        { id: 'a', title: 'first' },
        { id: 'b', title: 'second' },
      ])
    })
  })

  describe('appendChunk', () => {
    it('appends chunk to the last assistant message', () => {
      useChatStore.setState({
        currentRequestId: 'req-1',
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: '', timestamp: 2 },
        ],
      })

      useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: 'Hello' })
      useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: ' World' })

      expect(useChatStore.getState().messages[1].content).toBe('Hello World')
    })

    it('ignores chunks with mismatched requestId', () => {
      useChatStore.setState({
        currentRequestId: 'req-1',
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: 'original', timestamp: 2 },
        ],
      })

      useChatStore.getState().appendChunk({ requestId: 'req-2', chunk: 'ignored' })

      expect(useChatStore.getState().messages[1].content).toBe('original')
    })

    it('ignores chunks when last message is not assistant', () => {
      useChatStore.setState({
        currentRequestId: 'req-1',
        messages: [{ id: 'm1', role: 'user', content: 'Hi', timestamp: 1 }],
      })

      useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: 'test' })

      expect(useChatStore.getState().messages[0].content).toBe('Hi')
    })
  })

  describe('finishStream', () => {
    it('saves assistant message and resets streaming state', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        currentRequestId: 'req-1',
        streaming: true,
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: 'Hello!', timestamp: 2 },
        ],
      })
      mockInvoke.mockResolvedValueOnce(42) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // loadMemories

      await useChatStore.getState().finishStream({ requestId: 'req-1', content: '' })

      expect(mockInvoke).toHaveBeenCalledWith('chat-message-save', {
        session_id: 's1',
        role: 'assistant',
        content: 'Hello!',
      })
      expect(useChatStore.getState().streaming).toBe(false)
      expect(useChatStore.getState().currentRequestId).toBeNull()
    })

    it('uses payload.content if provided', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        currentRequestId: 'req-1',
        streaming: true,
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: 'partial', timestamp: 2 },
        ],
      })
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce([])

      await useChatStore
        .getState()
        .finishStream({ requestId: 'req-1', content: 'full content from payload' })

      expect(mockInvoke).toHaveBeenCalledWith('chat-message-save', {
        session_id: 's1',
        role: 'assistant',
        content: 'full content from payload',
      })
    })

    it('clears streaming state when persisting the assistant response fails', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        currentRequestId: 'req-1',
        streaming: true,
        messages: [{ id: 'm1', role: 'assistant', content: 'answer', timestamp: 1 }],
      })
      mockInvoke.mockRejectedValueOnce(new Error('database unavailable'))
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce([])

      await useChatStore.getState().finishStream({ requestId: 'req-1', content: 'answer' })

      expect(useChatStore.getState().streaming).toBe(false)
      expect(useChatStore.getState().currentRequestId).toBeNull()
      expect(useChatStore.getState().error).toBe('database unavailable')
    })

    it('does not let an older completion clear a newer active request', async () => {
      let releaseSave: (() => void) | null = null
      const pendingSave = new Promise<void>((resolve) => {
        releaseSave = resolve
      })
      useChatStore.setState({
        activeSessionId: 's1',
        currentRequestId: 'req-old',
        streaming: true,
        messages: [{ id: 'm1', role: 'assistant', content: 'old answer', timestamp: 1 }],
      })
      mockInvoke.mockImplementationOnce(() => pendingSave)

      const finishing = useChatStore
        .getState()
        .finishStream({ requestId: 'req-old', content: 'old answer' })
      useChatStore.setState({ currentRequestId: 'req-new', streaming: true })
      releaseSave?.()
      await finishing

      expect(useChatStore.getState().currentRequestId).toBe('req-new')
      expect(useChatStore.getState().streaming).toBe(true)
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('ignores finishStream with mismatched requestId', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        currentRequestId: 'req-1',
        streaming: true,
        messages: [],
      })

      await useChatStore.getState().finishStream({ requestId: 'req-2', content: '' })

      expect(mockInvoke).not.toHaveBeenCalled()
      expect(useChatStore.getState().streaming).toBe(true)
    })

    it('skips save when no content and no active session', async () => {
      useChatStore.setState({
        activeSessionId: null,
        currentRequestId: 'req-1',
        streaming: true,
        messages: [],
      })
      mockInvoke.mockResolvedValueOnce([]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // loadMemories

      await useChatStore.getState().finishStream({ requestId: 'req-1', content: '' })

      expect(mockInvoke).not.toHaveBeenCalledWith('chat-message-save', expect.anything())
    })
  })

  describe('loadPresets', () => {
    it('loads presets from IPC', async () => {
      const mockPresets = [
        { id: 1, name: 'Code Review', prompt: 'Review this code', is_builtin: 1 },
      ]
      mockInvoke.mockResolvedValueOnce(mockPresets)

      await useChatStore.getState().loadPresets()

      expect(mockInvoke).toHaveBeenCalledWith('chat-presets-list')
      expect(useChatStore.getState().presets).toEqual(mockPresets)
    })
  })

  describe('loadMemories', () => {
    it('loads memories from IPC', async () => {
      const mockMemories = [{ id: 1, content: 'I prefer Python', category: 'fact', source: 'chat' }]
      mockInvoke.mockResolvedValueOnce(mockMemories)

      await useChatStore.getState().loadMemories()

      expect(mockInvoke).toHaveBeenCalledWith('chat-memories-list', undefined)
      expect(useChatStore.getState().memories).toEqual(mockMemories)
    })

    it('passes search term to IPC', async () => {
      mockInvoke.mockResolvedValueOnce([])

      await useChatStore.getState().loadMemories('python')

      expect(mockInvoke).toHaveBeenCalledWith('chat-memories-list', 'python')
    })
  })

  describe('saveMemory', () => {
    it('saves memory and reloads', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // chat-memory-save
      mockInvoke.mockResolvedValueOnce([]) // loadMemories

      await useChatStore.getState().saveMemory({ content: 'I like TypeScript' })

      expect(mockInvoke).toHaveBeenCalledWith('chat-memory-save', { content: 'I like TypeScript' })
    })
  })

  describe('deleteMemory', () => {
    it('deletes memory and reloads', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // chat-memory-delete
      mockInvoke.mockResolvedValueOnce([]) // loadMemories

      await useChatStore.getState().deleteMemory(5)

      expect(mockInvoke).toHaveBeenCalledWith('chat-memory-delete', 5)
    })
  })
})
