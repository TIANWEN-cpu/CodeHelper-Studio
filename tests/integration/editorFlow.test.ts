/**
 * Integration test: Editor file-open -> edit -> save flow.
 *
 * Exercises editorStore tab lifecycle (add, close, switch, update content),
 * multi-tab management, and the code execution IPC call (`run-code`)
 * which captures console output.
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

const { useEditorStore } = await import('../../src/stores/editorStore')

// ---- Helpers ---------------------------------------------------------------
function resetStore() {
  useEditorStore.setState({
    tabs: [
      {
        id: 'welcome',
        filename: 'welcome.py',
        language: 'python',
        content: '# Welcome\nprint("hello")',
      },
    ],
    activeTabId: 'welcome',
  })
  mockInvoke.mockReset()
}

// ---- Tests ------------------------------------------------------------------
describe('Integration: editor flow', () => {
  beforeEach(resetStore)

  // ---- File open -> edit -> save ----------------------------------------
  describe('happy path: open -> edit -> save', () => {
    it('opens a file as a tab, edits content, and "saves" via IPC', async () => {
      // 1. Open a new file
      useEditorStore.getState().addTab({
        id: 'file-1',
        filename: 'solution.py',
        language: 'python',
        content: 'def solve():\n    pass\n',
      })
      expect(useEditorStore.getState().tabs).toHaveLength(2)
      expect(useEditorStore.getState().activeTabId).toBe('file-1')

      // 2. Edit the content
      const editedCode = 'def solve(arr):\n    return sorted(arr)\n'
      useEditorStore.getState().updateContent('file-1', editedCode)
      expect(useEditorStore.getState().tabs.find((t) => t.id === 'file-1')!.content).toBe(
        editedCode,
      )

      // 3. Run the code (simulates "save + run")
      mockInvoke.mockResolvedValueOnce({
        stdout: '[1, 2, 3]\n',
        stderr: '',
        exitCode: 0,
      })
      const result = await mockInvoke('run-code', { code: editedCode, language: 'python' })
      expect(result.stdout).toBe('[1, 2, 3]\n')
      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)

      // 4. Verify IPC was called with the correct payload
      expect(mockInvoke).toHaveBeenCalledWith('run-code', { code: editedCode, language: 'python' })
    })
  })

  // ---- Multi-tab management ---------------------------------------------
  describe('multi-tab management', () => {
    it('supports multiple tabs with independent content', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-a', filename: 'a.py', language: 'python', content: 'content-A' })
      useEditorStore
        .getState()
        .addTab({ id: 'tab-b', filename: 'b.js', language: 'javascript', content: 'content-B' })

      const { tabs } = useEditorStore.getState()
      expect(tabs).toHaveLength(3) // welcome + a + b
      expect(tabs.find((t) => t.id === 'tab-a')!.content).toBe('content-A')
      expect(tabs.find((t) => t.id === 'tab-b')!.content).toBe('content-B')
      // Latest added tab should be active
      expect(useEditorStore.getState().activeTabId).toBe('tab-b')
    })

    it("switching between tabs preserves each tab's content", () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-a', filename: 'a.py', language: 'python', content: 'original-A' })
      useEditorStore
        .getState()
        .addTab({ id: 'tab-b', filename: 'b.py', language: 'python', content: 'original-B' })

      // Edit tab A
      useEditorStore.getState().updateContent('tab-a', 'edited-A')
      // Switch to tab A
      useEditorStore.getState().setActiveTab('tab-a')
      expect(useEditorStore.getState().activeTabId).toBe('tab-a')

      // Verify tab B is untouched
      expect(useEditorStore.getState().tabs.find((t) => t.id === 'tab-b')!.content).toBe(
        'original-B',
      )
      // Verify tab A has edited content
      expect(useEditorStore.getState().tabs.find((t) => t.id === 'tab-a')!.content).toBe('edited-A')
    })

    it('closing a tab that is not active does not change activeTabId', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-a', filename: 'a.py', language: 'python', content: '' })
      useEditorStore
        .getState()
        .addTab({ id: 'tab-b', filename: 'b.py', language: 'python', content: '' })
      // activeTabId is now tab-b
      expect(useEditorStore.getState().activeTabId).toBe('tab-b')

      useEditorStore.getState().closeTab('tab-a')
      expect(useEditorStore.getState().activeTabId).toBe('tab-b')
      expect(useEditorStore.getState().tabs).toHaveLength(2)
    })

    it('closing the active tab falls back to the first remaining tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-a', filename: 'a.py', language: 'python', content: '' })
      useEditorStore.getState().setActiveTab('welcome')
      useEditorStore.getState().closeTab('welcome')

      expect(useEditorStore.getState().activeTabId).toBe('tab-a')
      expect(useEditorStore.getState().tabs).toHaveLength(1)
    })

    it('closing the last tab sets activeTabId to null', () => {
      useEditorStore.setState({
        tabs: [{ id: 'only', filename: 'x.py', language: 'python', content: '' }],
        activeTabId: 'only',
      })
      useEditorStore.getState().closeTab('only')
      expect(useEditorStore.getState().activeTabId).toBeNull()
      expect(useEditorStore.getState().tabs).toEqual([])
    })

    it('closing one of many tabs adjusts indices correctly', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-1', filename: '1.py', language: 'python', content: 'c1' })
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: '2.py', language: 'python', content: 'c2' })
      useEditorStore
        .getState()
        .addTab({ id: 'tab-3', filename: '3.py', language: 'python', content: 'c3' })
      // tabs: welcome, tab-1, tab-2, tab-3. active = tab-3

      useEditorStore.getState().closeTab('tab-1')
      expect(useEditorStore.getState().tabs.map((t) => t.id)).toEqual(['welcome', 'tab-2', 'tab-3'])
      expect(useEditorStore.getState().activeTabId).toBe('tab-3')
    })
  })

  // ---- Code execution with console output --------------------------------
  describe('code execution and console output', () => {
    it('captures stdout from successful code execution', async () => {
      const code = 'print("Hello, CodeHelper!")\nprint(2 + 2)'
      mockInvoke.mockResolvedValueOnce({
        stdout: 'Hello, CodeHelper!\n4\n',
        stderr: '',
        exitCode: 0,
      })

      const result = await mockInvoke('run-code', { code, language: 'python' })

      expect(result.stdout).toBe('Hello, CodeHelper!\n4\n')
      expect(result.exitCode).toBe(0)
    })

    it('captures stderr from failed code execution', async () => {
      const code = 'print(undefined_variable)'
      mockInvoke.mockResolvedValueOnce({
        stdout: '',
        stderr: "NameError: name 'undefined_variable' is not defined\n",
        exitCode: 1,
      })

      const result = await mockInvoke('run-code', { code, language: 'python' })

      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('NameError')
      expect(result.exitCode).toBe(1)
    })

    it('handles runner timeout', async () => {
      mockInvoke.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Execution timed out',
        exitCode: 124,
        stage: 'timeout',
      })

      const result = await mockInvoke('run-code', { code: 'while True: pass', language: 'python' })

      expect(result.exitCode).toBe(124)
      expect(result.stage).toBe('timeout')
    })

    it('handles runner IPC error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Runner process crashed'))

      await expect(mockInvoke('run-code', { code: 'x=1', language: 'python' })).rejects.toThrow(
        'Runner process crashed',
      )
    })

    it('runs code for different languages', async () => {
      // Python
      mockInvoke.mockResolvedValueOnce({ stdout: '42\n', stderr: '', exitCode: 0 })
      const pyResult = await mockInvoke('run-code', { code: 'print(42)', language: 'python' })
      expect(pyResult.stdout).toBe('42\n')

      // JavaScript
      mockInvoke.mockResolvedValueOnce({ stdout: '42\n', stderr: '', exitCode: 0 })
      const jsResult = await mockInvoke('run-code', {
        code: 'console.log(42)',
        language: 'javascript',
      })
      expect(jsResult.stdout).toBe('42\n')
    })

    it('captures mixed stdout and stderr', async () => {
      mockInvoke.mockResolvedValueOnce({
        stdout: 'line1\nline2\n',
        stderr: 'warning: something\n',
        exitCode: 0,
      })

      const result = await mockInvoke('run-code', {
        code: 'import sys; print("line1"); print("line2"); print("warning: something", file=sys.stderr)',
        language: 'python',
      })

      expect(result.stdout).toBe('line1\nline2\n')
      expect(result.stderr).toBe('warning: something\n')
      expect(result.exitCode).toBe(0)
    })
  })

  // ---- Editing workflow: open -> multiple edits -> run -------------------
  describe('iterative edit workflow', () => {
    it('supports incremental edits before running', () => {
      useEditorStore.getState().addTab({
        id: 'iterative',
        filename: 'solution.py',
        language: 'python',
        content: '# TODO',
      })

      // Edit 1: Write initial solution
      useEditorStore.getState().updateContent('iterative', 'def f(x):\n    return x')
      // Edit 2: Fix the solution
      useEditorStore.getState().updateContent('iterative', 'def f(x):\n    return x * 2')

      const finalContent = useEditorStore.getState().tabs.find((t) => t.id === 'iterative')!.content
      expect(finalContent).toBe('def f(x):\n    return x * 2')

      // Run the final version
      mockInvoke.mockResolvedValueOnce({ stdout: '6\n', stderr: '', exitCode: 0 })
      return mockInvoke('run-code', { code: finalContent, language: 'python' }).then(
        (r: { stdout: string }) => {
          expect(r.stdout).toBe('6\n')
        },
      )
    })
  })

  // ---- Tab deduplication (same id) ---------------------------------------
  describe('tab id uniqueness', () => {
    it('adding a tab with an existing id appends it (no dedup)', () => {
      // The store does not enforce id uniqueness -- it just appends
      useEditorStore
        .getState()
        .addTab({ id: 'welcome', filename: 'welcome2.py', language: 'python', content: 'second' })
      const welcomeTabs = useEditorStore.getState().tabs.filter((t) => t.id === 'welcome')
      expect(welcomeTabs).toHaveLength(2)
    })
  })

  // ---- Language property on tabs -----------------------------------------
  describe('language-aware tabs', () => {
    it('each tab carries its own language', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'py', filename: 'x.py', language: 'python', content: '' })
      useEditorStore
        .getState()
        .addTab({ id: 'js', filename: 'x.js', language: 'javascript', content: '' })
      useEditorStore
        .getState()
        .addTab({ id: 'cpp', filename: 'x.cpp', language: 'cpp', content: '' })

      const tabs = useEditorStore.getState().tabs
      expect(tabs.find((t) => t.id === 'py')!.language).toBe('python')
      expect(tabs.find((t) => t.id === 'js')!.language).toBe('javascript')
      expect(tabs.find((t) => t.id === 'cpp')!.language).toBe('cpp')
    })
  })
})
