/**
 * Integration test: Chat session lifecycle.
 *
 * Exercises the full flow: session creation -> message send -> stream receive,
 * session switching, session deletion, abort via requestId mismatch,
 * and error recovery.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// ---- Mock IPC layer -------------------------------------------------------
const mockInvoke = vi.fn() as Mock
vi.mock('../../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

const { useChatStore } = await import('../../src/stores/chatStore')

// ---- Fixtures --------------------------------------------------------------
const MOCK_SESSION_A = {
  id: 'session-a',
  title: 'Python Basics',
  system_prompt: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
const MOCK_SESSION_B = {
  id: 'session-b',
  title: 'Algorithms',
  system_prompt: 'You are an algorithm tutor',
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

const _HISTORY_A = [
  { id: 1, role: 'user' as const, content: 'What is a list?', created_at: '2026-01-01T00:01:00Z' },
  {
    id: 2,
    role: 'assistant' as const,
    content: 'A list is an ordered collection...',
    created_at: '2026-01-01T00:01:05Z',
  },
]
const HISTORY_B = [
  {
    id: 3,
    role: 'user' as const,
    content: 'Explain quicksort',
    created_at: '2026-01-02T00:01:00Z',
  },
  {
    id: 4,
    role: 'assistant' as const,
    content: 'Quicksort is a divide-and-conquer algorithm...',
    created_at: '2026-01-02T00:01:10Z',
  },
  {
    id: 5,
    role: 'user' as const,
    content: 'What is its time complexity?',
    created_at: '2026-01-02T00:02:00Z',
  },
  {
    id: 6,
    role: 'assistant' as const,
    content: 'Average O(n log n), worst O(n^2)',
    created_at: '2026-01-02T00:02:05Z',
  },
]

// ---- Helpers ---------------------------------------------------------------
function resetStore() {
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
}

// ---- Tests ------------------------------------------------------------------
describe('Integration: chat flow', () => {
  beforeEach(resetStore)

  // ---- Full happy path: create session -> send message -> receive stream --
  describe('happy path: create -> send -> stream -> finish', () => {
    it('completes a full chat cycle with streaming', async () => {
      // Step 1: Create session
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-create
      mockInvoke.mockResolvedValueOnce([MOCK_SESSION_A]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // switchSession -> chat-messages-load

      const sessionId = await useChatStore.getState().createSession()
      expect(sessionId).toMatch(/^session-/)
      expect(useChatStore.getState().activeSessionId).toBe(sessionId)
      expect(useChatStore.getState().messages).toEqual([])

      // Step 2: Send message
      // Capture the requestId that the store generates
      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save (user)
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      // renameSession (title was '新对�?)
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-update
      mockInvoke.mockResolvedValueOnce([MOCK_SESSION_A]) // loadSessions
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('Hello, what is Python?')

      // User message and empty assistant placeholder should be in messages
      const state1 = useChatStore.getState()
      expect(state1.messages).toHaveLength(2)
      expect(state1.messages[0].role).toBe('user')
      expect(state1.messages[0].content).toBe('Hello, what is Python?')
      expect(state1.messages[1].role).toBe('assistant')
      expect(state1.messages[1].content).toBe('')
      expect(state1.streaming).toBe(true)
      expect(state1.currentRequestId).toBeTruthy()

      // Step 3: Simulate stream chunks arriving
      const reqId = state1.currentRequestId!
      useChatStore.getState().appendChunk({ requestId: reqId, chunk: 'Python is ' })
      useChatStore.getState().appendChunk({ requestId: reqId, chunk: 'a high-level ' })
      useChatStore.getState().appendChunk({ requestId: reqId, chunk: 'programming language.' })

      expect(useChatStore.getState().messages[1].content).toBe(
        'Python is a high-level programming language.',
      )

      // Step 4: Finish stream
      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save (assistant)
      mockInvoke.mockResolvedValueOnce([MOCK_SESSION_A]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // loadMemories

      await useChatStore.getState().finishStream({ requestId: reqId, content: '' })

      expect(useChatStore.getState().streaming).toBe(false)
      expect(useChatStore.getState().currentRequestId).toBeNull()
      // Verify assistant message was saved
      const saveCall = mockInvoke.mock.calls.find(
        (c: unknown[]) =>
          c[0] === 'chat-message-save' && (c[1] as { role: string }).role === 'assistant',
      )
      expect(saveCall).toBeTruthy()
      expect((saveCall![1] as { content: string }).content).toBe(
        'Python is a high-level programming language.',
      )
    })
  })

  // ---- Session switching -------------------------------------------------
  describe('session switching', () => {
    it('loads history for the target session and resets streaming state', async () => {
      // Set up: two sessions exist
      useChatStore.setState({
        sessions: [MOCK_SESSION_A, MOCK_SESSION_B],
        activeSessionId: 'session-a',
      })

      // Switch to session B
      mockInvoke.mockResolvedValueOnce(HISTORY_B)
      await useChatStore.getState().switchSession('session-b')

      const state = useChatStore.getState()
      expect(state.activeSessionId).toBe('session-b')
      expect(state.messages).toHaveLength(4)
      expect(state.messages[0].content).toBe('Explain quicksort')
      expect(state.messages[1].content).toBe('Quicksort is a divide-and-conquer algorithm...')
      expect(state.messages[2].content).toBe('What is its time complexity?')
      expect(state.messages[3].content).toBe('Average O(n log n), worst O(n^2)')
      expect(state.error).toBeNull()
      expect(state.streaming).toBe(false)
      expect(state.currentRequestId).toBeNull()
    })

    it('switching session mid-stream cancels the in-flight request logically', async () => {
      useChatStore.setState({
        sessions: [MOCK_SESSION_A, MOCK_SESSION_B],
        activeSessionId: 'session-a',
        streaming: true,
        currentRequestId: 'req-old',
        messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
      })

      mockInvoke.mockResolvedValueOnce(HISTORY_B)
      await useChatStore.getState().switchSession('session-b')

      // Streaming should be reset
      expect(useChatStore.getState().streaming).toBe(false)
      expect(useChatStore.getState().currentRequestId).toBeNull()

      // Old chunks should be ignored now
      useChatStore.getState().appendChunk({ requestId: 'req-old', chunk: 'ghost' })
      // The messages are from session B now, not the old session
      expect(useChatStore.getState().messages[0].content).toBe('Explain quicksort')
    })
  })

  // ---- Session deletion --------------------------------------------------
  describe('session deletion', () => {
    it('deleting the active session falls back to the first remaining', async () => {
      useChatStore.setState({
        sessions: [MOCK_SESSION_A, MOCK_SESSION_B],
        activeSessionId: 'session-a',
      })

      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-delete
      mockInvoke.mockResolvedValueOnce([MOCK_SESSION_B]) // loadSessions
      mockInvoke.mockResolvedValueOnce(HISTORY_B) // switchSession -> chat-messages-load

      await useChatStore.getState().deleteSession('session-a')

      expect(useChatStore.getState().activeSessionId).toBe('session-b')
      expect(useChatStore.getState().messages).toHaveLength(4)
    })

    it('deleting the last session clears all state', async () => {
      useChatStore.setState({
        sessions: [MOCK_SESSION_A],
        activeSessionId: 'session-a',
        messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
      })

      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-delete
      mockInvoke.mockResolvedValueOnce([]) // loadSessions returns empty

      await useChatStore.getState().deleteSession('session-a')

      const state = useChatStore.getState()
      expect(state.activeSessionId).toBeNull()
      expect(state.messages).toEqual([])
      expect(state.sessions).toEqual([])
    })
  })

  // ---- Abort flow via requestId mismatch ---------------------------------
  describe('abort via requestId mismatch', () => {
    it('chunks from a stale request are ignored', () => {
      useChatStore.setState({
        currentRequestId: 'req-current',
        messages: [
          { id: 'u1', role: 'user', content: 'Q', timestamp: 1 },
          { id: 'a1', role: 'assistant', content: 'correct', timestamp: 2 },
        ],
      })

      // Stale chunk from an old request
      useChatStore.getState().appendChunk({ requestId: 'req-stale', chunk: 'WRONG' })

      expect(useChatStore.getState().messages[1].content).toBe('correct')
    })

    it('finishStream from a stale request is a no-op', async () => {
      useChatStore.setState({
        currentRequestId: 'req-current',
        activeSessionId: 'session-a',
        streaming: true,
      })

      await useChatStore.getState().finishStream({ requestId: 'req-stale', content: 'stale' })

      // streaming should remain true -- stale finish was ignored
      expect(useChatStore.getState().streaming).toBe(true)
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  // ---- Send message error recovery ---------------------------------------
  describe('error: sendMessage IPC failure', () => {
    it('sets error message and stops streaming', async () => {
      useChatStore.setState({
        activeSessionId: 'session-a',
        sessions: [{ ...MOCK_SESSION_A, title: 'Existing' }],
      })

      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockRejectedValueOnce(new Error('API key invalid')) // ai-chat

      await useChatStore.getState().sendMessage('Test')

      const state = useChatStore.getState()
      expect(state.error).toBe('API key invalid')
      expect(state.streaming).toBe(false)
      expect(state.currentRequestId).toBeNull()
      // Assistant message should contain the error
      expect(state.messages[state.messages.length - 1].content).toBe('API key invalid')
    })
  })

  // ---- sendMessage auto-creates session when none is active --------------
  describe('auto-create session on sendMessage', () => {
    it('creates a session then sends the message', async () => {
      useChatStore.setState({ activeSessionId: null, sessions: [] })

      // createSession IPC calls
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-create
      mockInvoke.mockResolvedValueOnce([
        { id: 'session-new', title: '新对话', system_prompt: '', created_at: '', updated_at: '' },
      ]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // switchSession -> chat-messages-load
      // sendMessage IPC calls
      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save (user)
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce(undefined) // renameSession
      mockInvoke.mockResolvedValueOnce([]) // loadSessions
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('Hello!')

      expect(useChatStore.getState().activeSessionId).toMatch(/^session-/)
      expect(useChatStore.getState().messages).toHaveLength(2)
    })
  })

  // ---- System prompt propagation -----------------------------------------
  describe('system prompt propagation', () => {
    it('includes system prompt as first message in AI call', async () => {
      useChatStore.setState({
        activeSessionId: 'session-b',
        sessions: [MOCK_SESSION_B],
      })

      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage('Explain mergesort')

      const aiChatCall = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'ai-chat')
      expect(aiChatCall).toBeTruthy()
      const payload = aiChatCall![1] as { messages: Array<{ role: string; content: string }> }
      expect(payload.messages[0]).toEqual({ role: 'system', content: 'You are an algorithm tutor' })
    })
  })

  // ---- Multi-chunk streaming with appendChunk ----------------------------
  describe('streaming accumulation', () => {
    it('accumulates multiple chunks into the assistant message', () => {
      useChatStore.setState({
        currentRequestId: 'req-1',
        messages: [
          { id: 'u1', role: 'user', content: 'Tell me a story', timestamp: 1 },
          { id: 'a1', role: 'assistant', content: '', timestamp: 2 },
        ],
      })

      const chunks = ['Once ', 'upon ', 'a ', 'time...']
      for (const chunk of chunks) {
        useChatStore.getState().appendChunk({ requestId: 'req-1', chunk })
      }

      expect(useChatStore.getState().messages[1].content).toBe('Once upon a time...')
    })
  })

  // ---- finishStream uses payload.content over accumulated -----------------
  describe('finishStream content override', () => {
    it('uses payload.content when provided', async () => {
      useChatStore.setState({
        activeSessionId: 'session-a',
        currentRequestId: 'req-1',
        streaming: true,
        messages: [
          { id: 'u1', role: 'user', content: 'hi', timestamp: 1 },
          { id: 'a1', role: 'assistant', content: 'partial...', timestamp: 2 },
        ],
      })

      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // loadMemories

      await useChatStore.getState().finishStream({ requestId: 'req-1', content: 'FULL CONTENT' })

      // The save should have used the payload content
      const saveCall = mockInvoke.mock.calls.find(
        (c: unknown[]) =>
          c[0] === 'chat-message-save' && (c[1] as { role: string }).role === 'assistant',
      )
      expect((saveCall![1] as { content: string }).content).toBe('FULL CONTENT')
    })
  })

  // ---- Presets and memories ----------------------------------------------
  describe('presets and memories', () => {
    it('loads presets and memories independently', async () => {
      const mockPresets = [
        { id: 1, name: 'Code Review', prompt: 'Review this code', is_builtin: 1 },
      ]
      const mockMemories = [
        {
          id: 1,
          content: 'User prefers Python',
          category: 'fact',
          source: 'chat',
          source_ref: null,
          pinned: 0,
          enabled: 1,
          confidence: 0.9,
          created_at: '',
          updated_at: '',
          last_used_at: null,
        },
      ]

      mockInvoke.mockResolvedValueOnce(mockPresets)
      mockInvoke.mockResolvedValueOnce(mockMemories)

      await useChatStore.getState().loadPresets()
      await useChatStore.getState().loadMemories()

      expect(useChatStore.getState().presets).toEqual(mockPresets)
      expect(useChatStore.getState().memories).toEqual(mockMemories)
    })

    it('saveMemory and deleteMemory trigger reloads', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // chat-memory-save
      mockInvoke.mockResolvedValueOnce([]) // loadMemories
      await useChatStore.getState().saveMemory({ content: 'I like TypeScript' })
      expect(mockInvoke).toHaveBeenCalledWith('chat-memory-save', { content: 'I like TypeScript' })

      mockInvoke.mockResolvedValueOnce(undefined) // chat-memory-delete
      mockInvoke.mockResolvedValueOnce([]) // loadMemories
      await useChatStore.getState().deleteMemory(5)
      expect(mockInvoke).toHaveBeenCalledWith('chat-memory-delete', 5)
    })
  })

  // ---- Session rename ----------------------------------------------------
  describe('session rename', () => {
    it('renames session and refreshes session list', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-update
      mockInvoke.mockResolvedValueOnce([{ ...MOCK_SESSION_A, title: 'New Title' }]) // loadSessions

      await useChatStore.getState().renameSession('session-a', 'New Title')

      expect(mockInvoke).toHaveBeenCalledWith('chat-session-update', 'session-a', {
        title: 'New Title',
      })
    })
  })
})
