# CodeHelper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop app combining IDE, coding practice, AI assistant, mistake tracking, and local knowledge base.

**Architecture:** Single Electron app with React renderer. Main process handles DB, code execution, AI API proxy, RAG. IPC bridges main↔renderer. Packaged as .exe via electron-builder.

**Tech Stack:** Electron 30, React 18, TypeScript, TailwindCSS, Monaco Editor, Zustand, better-sqlite3, electron-vite, electron-builder

---

## Phase 1: Project Scaffolding

### Task 1: Initialize electron-vite project

**Files:**

- Create: `D:\codehelper\package.json`
- Create: `D:\codehelper\electron.vite.config.ts`
- Create: `D:\codehelper\electron\main.ts`
- Create: `D:\codehelper\electron\preload.ts`
- Create: `D:\codehelper\src\main.tsx`
- Create: `D:\codehelper\src\App.tsx`
- Create: `D:\codehelper\tailwind.config.js`
- Create: `D:\codehelper\tsconfig.json`
- Create: `D:\codehelper\tsconfig.node.json`
- Create: `D:\codehelper\tsconfig.web.json`

- [ ] **Step 1: Create project with electron-vite**

```bash
cd D:/codehelper
npm create @quick-start/electron@latest . -- --template react-ts
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install tailwindcss @tailwindcss/vite zustand better-sqlite3 lucide-react
npm install -D @types/better-sqlite3
```

- [ ] **Step 3: Configure TailwindCSS**

Replace `src/assets/main.css` with:

```css
@import 'tailwindcss';
```

Add TailwindCSS plugin to `electron.vite.config.ts` renderer vite config:

```ts
import tailwindcss from '@tailwindcss/vite'
// in renderer config plugins array:
tailwindcss()
```

- [ ] **Step 4: Run dev to verify**

```bash
npm run dev
```

Expected: Electron window opens with React content.

- [ ] **Step 5: Commit**

```bash
git init && git add -A && git commit -m "feat: initialize electron-vite project with React + TailwindCSS"
```

### Task 2: Build shell layout (VSCode-style sidebar + main area)

**Files:**

- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Layout.tsx`
- Create: `src/stores/appStore.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create app store**

```typescript
// src/stores/appStore.ts
import { create } from 'zustand'

export type ModuleId = 'problems' | 'editor' | 'ai-chat' | 'mistakes' | 'knowledge' | 'settings'

interface AppState {
  activeModule: ModuleId
  setActiveModule: (id: ModuleId) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'problems',
  setActiveModule: (id) => set({ activeModule: id }),
}))
```

- [ ] **Step 2: Create Sidebar component**

```tsx
// src/components/Sidebar.tsx
import { useAppStore, type ModuleId } from '../stores/appStore'
import { Code2, BookOpen, Bot, XCircle, Library, Settings } from 'lucide-react'

const navItems: { id: ModuleId; icon: typeof Code2; label: string }[] = [
  { id: 'problems', icon: BookOpen, label: '刷题' },
  { id: 'editor', icon: Code2, label: '编辑器' },
  { id: 'ai-chat', icon: Bot, label: 'AI助手' },
  { id: 'mistakes', icon: XCircle, label: '错题本' },
  { id: 'knowledge', icon: Library, label: '知识库' },
  { id: 'settings', icon: Settings, label: '设置' },
]

export function Sidebar() {
  const { activeModule, setActiveModule } = useAppStore()
  return (
    <div className="w-12 bg-[#181825] flex flex-col items-center py-3 gap-2 border-r border-[#313244]">
      {navItems.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          title={label}
          onClick={() => setActiveModule(id)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            activeModule === id
              ? 'bg-[#cba6f7] text-[#1e1e2e]'
              : 'text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244]'
          } ${id === 'settings' ? 'mt-auto' : ''}`}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create Layout and update App**

```tsx
// src/components/Layout.tsx
import { Sidebar } from './Sidebar'
import { useAppStore } from '../stores/appStore'

export function Layout() {
  const activeModule = useAppStore((s) => s.activeModule)
  return (
    <div className="h-screen flex bg-[#1e1e2e] text-[#cdd6f4]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 p-4 overflow-auto">
          <h1 className="text-xl font-bold">
            {activeModule === 'problems' && '刷题系统'}
            {activeModule === 'editor' && '代码编辑器'}
            {activeModule === 'ai-chat' && 'AI 助手'}
            {activeModule === 'mistakes' && '错题本'}
            {activeModule === 'knowledge' && '知识库'}
            {activeModule === 'settings' && '设置'}
          </h1>
          <p className="text-[#6c7086] mt-2">模块开发中...</p>
        </div>
      </div>
    </div>
  )
}
```

```tsx
// src/App.tsx
import { Layout } from './components/Layout'

function App() {
  return <Layout />
}

export default App
```

- [ ] **Step 4: Run dev to verify sidebar navigation**

```bash
npm run dev
```

Expected: Dark window with left icon sidebar, clicking icons switches module title.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add VSCode-style sidebar layout with module navigation"
```

---

## Phase 2: Monaco Editor Integration

### Task 3: Integrate Monaco Editor with multi-tab support

**Files:**

- Create: `src/modules/editor/MonacoEditor.tsx`
- Create: `src/modules/editor/EditorTabs.tsx`
- Create: `src/modules/editor/EditorView.tsx`
- Create: `src/stores/editorStore.ts`

- [ ] **Step 1: Install Monaco Editor**

```bash
npm install @monaco-editor/react monaco-editor
```

- [ ] **Step 2: Create editor store**

```typescript
// src/stores/editorStore.ts
import { create } from 'zustand'

export interface EditorTab {
  id: string
  filename: string
  language: string
  content: string
}

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  addTab: (tab: EditorTab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [
    {
      id: 'welcome',
      filename: 'welcome.py',
      language: 'python',
      content: '# 欢迎使用 CodeHelper!\nprint("Hello, World!")\n',
    },
  ],
  activeTabId: 'welcome',
  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),
  closeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId = s.activeTabId === id ? (tabs[0]?.id ?? null) : s.activeTabId
      return { tabs, activeTabId }
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    })),
}))
```

- [ ] **Step 3: Create MonacoEditor component**

```tsx
// src/modules/editor/MonacoEditor.tsx
import Editor from '@monaco-editor/react'
import { useEditorStore } from '../../stores/editorStore'

export function MonacoEditor() {
  const { tabs, activeTabId, updateContent } = useEditorStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#6c7086]">无打开的文件</div>
    )
  }

  return (
    <Editor
      theme="vs-dark"
      language={activeTab.language}
      value={activeTab.content}
      onChange={(value) => updateContent(activeTab.id, value ?? '')}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        padding: { top: 12 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  )
}
```

- [ ] **Step 4: Create EditorTabs component**

```tsx
// src/modules/editor/EditorTabs.tsx
import { X } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

export function EditorTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore()

  return (
    <div className="flex bg-[#181825] border-b border-[#313244] overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer border-r border-[#313244] ${
            activeTabId === tab.id
              ? 'bg-[#1e1e2e] text-[#cdd6f4]'
              : 'text-[#6c7086] hover:bg-[#1e1e2e]/50'
          }`}
        >
          <span>{tab.filename}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            className="hover:bg-[#313244] rounded p-0.5"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create EditorView and wire into Layout**

```tsx
// src/modules/editor/EditorView.tsx
import { EditorTabs } from './EditorTabs'
import { MonacoEditor } from './MonacoEditor'

export function EditorView() {
  return (
    <div className="flex-1 flex flex-col">
      <EditorTabs />
      <div className="flex-1">
        <MonacoEditor />
      </div>
    </div>
  )
}
```

Update `Layout.tsx` to render `<EditorView />` when `activeModule === 'editor'`.

- [ ] **Step 6: Verify and commit**

```bash
npm run dev
```

Expected: Click editor icon → see tabs + Monaco editor with syntax highlighting.

```bash
git add -A && git commit -m "feat: integrate Monaco Editor with multi-tab support"
```

### Task 4: Code execution via IPC

**Files:**

- Create: `electron/ipc/runner.ts`
- Modify: `electron/main.ts` — register IPC handlers
- Modify: `electron/preload.ts` — expose API
- Create: `src/modules/editor/Console.tsx`
- Modify: `src/modules/editor/EditorView.tsx` — add run button + console

- [ ] **Step 1: Create code runner IPC handler**

```typescript
// electron/ipc/runner.ts
import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import { writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const tempDir = join(app.getPath('temp'), 'codehelper')

export function registerRunnerIPC() {
  mkdirSync(tempDir, { recursive: true })

  ipcMain.handle(
    'run-code',
    async (_event, args: { code: string; language: string; stdin?: string }) => {
      const { code, language, stdin } = args

      let cmd: string
      let cmdArgs: string[]
      let tempFile: string | null = null

      switch (language) {
        case 'python': {
          tempFile = join(tempDir, 'main.py')
          writeFileSync(tempFile, code)
          cmd = 'python'
          cmdArgs = [tempFile]
          break
        }
        case 'c': {
          tempFile = join(tempDir, 'main.c')
          const outFile = join(tempDir, 'main.exe')
          writeFileSync(tempFile, code)
          // compile first
          const compileResult = await runProcess('gcc', [tempFile, '-o', outFile], undefined, 10000)
          if (compileResult.exitCode !== 0) return { ...compileResult, stage: 'compile' }
          cmd = outFile
          cmdArgs = []
          break
        }
        case 'cpp': {
          tempFile = join(tempDir, 'main.cpp')
          const outFile = join(tempDir, 'main.exe')
          writeFileSync(tempFile, code)
          const compileResult = await runProcess('g++', [tempFile, '-o', outFile], undefined, 10000)
          if (compileResult.exitCode !== 0) return { ...compileResult, stage: 'compile' }
          cmd = outFile
          cmdArgs = []
          break
        }
        default:
          return { stdout: '', stderr: `不支持的语言: ${language}`, exitCode: 1 }
      }

      const result = await runProcess(cmd, cmdArgs, stdin, 10000)
      return { ...result, stage: 'run' }
    },
  )
}

function runProcess(
  cmd: string,
  args: string[],
  stdin?: string,
  timeout = 10000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { timeout, shell: true })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))

    if (stdin) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    }

    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }))
    proc.on('error', (err) => resolve({ stdout, stderr: err.message, exitCode: 1 }))
  })
}
```

- [ ] **Step 2: Update preload.ts to expose run-code API**

```typescript
// electron/preload.ts — add to contextBridge.exposeInMainWorld
api: {
  runCode: (args: { code: string; language: string; stdin?: string }) =>
    ipcRenderer.invoke('run-code', args),
}
```

- [ ] **Step 3: Register IPC in main.ts**

```typescript
// electron/main.ts — in app.whenReady()
import { registerRunnerIPC } from './ipc/runner'
registerRunnerIPC()
```

- [ ] **Step 4: Create Console component and add Run button**

```tsx
// src/modules/editor/Console.tsx
interface ConsoleProps {
  output: { stdout: string; stderr: string } | null
  running: boolean
}

export function Console({ output, running }: ConsoleProps) {
  return (
    <div className="h-48 bg-[#181825] border-t border-[#313244] flex flex-col">
      <div className="px-3 py-1 text-xs text-[#6c7086] border-b border-[#313244]">控制台</div>
      <div className="flex-1 p-3 overflow-auto font-mono text-sm">
        {running && <span className="text-[#f9e2af]">运行中...</span>}
        {output?.stdout && (
          <pre className="text-[#a6e3a1] whitespace-pre-wrap">{output.stdout}</pre>
        )}
        {output?.stderr && (
          <pre className="text-[#f38ba8] whitespace-pre-wrap">{output.stderr}</pre>
        )}
      </div>
    </div>
  )
}
```

Update `EditorView.tsx` to add a Run button and Console panel, calling `window.api.runCode()`.

- [ ] **Step 5: Verify and commit**

```bash
npm run dev
```

Expected: Type Python code → click Run → see output in console.

```bash
git add -A && git commit -m "feat: add code execution via IPC with console output"
```

---

## Phase 3: AI Chat

### Task 5: Set up SQLite database and settings storage

**Files:**

- Create: `electron/db/index.ts`
- Create: `electron/db/schema.sql`
- Create: `electron/ipc/database.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Create database module**

```typescript
// electron/db/index.ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'

let db: Database.Database

export function getDB(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'codehelper.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf-8')
    db.exec(schema)
  }
  return db
}
```

- [ ] **Step 2: Create schema.sql**

Full schema from the design doc (problems, submissions, mistakes, ai_configs, chat_history, knowledge_docs, knowledge_chunks, settings tables) with CREATE TABLE IF NOT EXISTS.

- [ ] **Step 3: Create database IPC for settings and AI config**

```typescript
// electron/ipc/database.ts
import { ipcMain } from 'electron'
import { getDB } from '../db'

export function registerDatabaseIPC() {
  ipcMain.handle('db-get-setting', (_e, key: string) => {
    return getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key)
  })

  ipcMain.handle('db-set-setting', (_e, key: string, value: string) => {
    getDB().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  ipcMain.handle('db-get-ai-configs', () => {
    return getDB().prepare('SELECT * FROM ai_configs ORDER BY is_default DESC').all()
  })

  ipcMain.handle('db-save-ai-config', (_e, config) => {
    const db = getDB()
    if (config.id) {
      db.prepare(
        'UPDATE ai_configs SET name=?, api_key=?, base_url=?, model=?, is_default=?, task_type=? WHERE id=?',
      ).run(
        config.name,
        config.api_key,
        config.base_url,
        config.model,
        config.is_default ? 1 : 0,
        config.task_type,
        config.id,
      )
    } else {
      db.prepare(
        'INSERT INTO ai_configs (name, api_key, base_url, model, is_default, task_type) VALUES (?,?,?,?,?,?)',
      ).run(
        config.name,
        config.api_key,
        config.base_url,
        config.model,
        config.is_default ? 1 : 0,
        config.task_type,
      )
    }
  })

  ipcMain.handle('db-delete-ai-config', (_e, id: number) => {
    getDB().prepare('DELETE FROM ai_configs WHERE id = ?').run(id)
  })
}
```

- [ ] **Step 4: Wire up, verify, commit**

Register IPC handlers in main.ts, expose in preload.ts. Verify app starts without DB errors.

```bash
git add -A && git commit -m "feat: add SQLite database with settings and AI config storage"
```

### Task 6: Build AI settings page

**Files:**

- Create: `src/modules/settings/SettingsView.tsx`
- Create: `src/modules/settings/AIConfigForm.tsx`
- Create: `src/stores/settingsStore.ts`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create settings store**

Zustand store that loads AI configs from DB via IPC, supports add/edit/delete.

- [ ] **Step 2: Create AIConfigForm component**

Form with fields: name, API Key, Base URL, model, is_default checkbox, task_type dropdown. Save calls IPC.

- [ ] **Step 3: Create SettingsView**

Lists all AI configs as cards, plus "添加配置" button opening the form. Wire into Layout.

- [ ] **Step 4: Verify and commit**

```bash
npm run dev
```

Expected: Settings page → add API config → saved to SQLite → persists across restart.

```bash
git add -A && git commit -m "feat: add AI model settings page with CRUD"
```

### Task 7: Build AI chat interface with streaming

**Files:**

- Create: `electron/ipc/ai.ts`
- Create: `src/modules/ai-chat/ChatView.tsx`
- Create: `src/modules/ai-chat/ChatMessage.tsx`
- Create: `src/modules/ai-chat/ChatInput.tsx`
- Create: `src/stores/chatStore.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create AI IPC handler with streaming**

```typescript
// electron/ipc/ai.ts
import { ipcMain, BrowserWindow } from 'electron'
import { getDB } from '../db'

export function registerAIIPC() {
  ipcMain.handle('ai-chat', async (event, args: { messages: any[]; configId?: number }) => {
    const db = getDB()
    const config = args.configId
      ? (db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(args.configId) as any)
      : (db.prepare('SELECT * FROM ai_configs WHERE is_default = 1').get() as any)

    if (!config) throw new Error('未配置AI模型，请先在设置中添加')

    const response = await fetch(`${config.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: args.messages,
        stream: true,
      }),
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const win = BrowserWindow.fromWebContents(event.sender)!

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))
      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const content = json.choices?.[0]?.delta?.content
          if (content) win.webContents.send('ai-chat-chunk', content)
        } catch {}
      }
    }

    win.webContents.send('ai-chat-done')
  })
}
```

- [ ] **Step 2: Create chat store**

Zustand store with sessions, messages, streaming state. Methods: sendMessage, appendChunk, newSession.

- [ ] **Step 3: Create ChatMessage component**

Renders user/assistant messages with Markdown support (use a simple markdown renderer). Assistant messages animate during streaming.

- [ ] **Step 4: Create ChatInput component**

Textarea with send button, Shift+Enter for newline, Enter to send. Disabled during streaming.

- [ ] **Step 5: Create ChatView and wire up**

```tsx
// src/modules/ai-chat/ChatView.tsx
// Combines message list + input, handles streaming via IPC listener
```

- [ ] **Step 6: Verify and commit**

```bash
npm run dev
```

Expected: Configure API key in settings → switch to AI chat → send message → see streaming response.

```bash
git add -A && git commit -m "feat: add AI chat with streaming responses"
```

---

## Phase 4: Problem System

### Task 8: Create problem database operations and seed data

**Files:**

- Create: `electron/ipc/problems.ts`
- Create: `resources/problems/basic.json` — 10+ starter problems
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Create problems IPC handler**

CRUD for problems table + submissions table. Includes: list (with filters), get by id, create, import from JSON, submit answer, get submissions.

- [ ] **Step 2: Create seed problem data**

`resources/problems/basic.json` with 10+ problems covering arrays, strings, basic algorithms. Each has title, description (Markdown), difficulty, tags, examples, test_cases, starter_code for Python.

- [ ] **Step 3: Add auto-seed on first launch**

In database init, check if problems table is empty, if so load from basic.json.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add problem database with seed data"
```

### Task 9: Build problem list and detail view

**Files:**

- Create: `src/modules/problems/ProblemList.tsx`
- Create: `src/modules/problems/ProblemDetail.tsx`
- Create: `src/modules/problems/ProblemsView.tsx`
- Create: `src/stores/problemStore.ts`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create problem store**

Zustand store: load problems list, active problem, filters (difficulty, tags, status), submissions for current problem.

- [ ] **Step 2: Create ProblemList**

Filterable list with difficulty badges (green/yellow/red), completion status icons, tag chips. Click to select.

- [ ] **Step 3: Create ProblemDetail**

Left-right split: left = problem description (Markdown rendered) + examples, right = Monaco editor + language selector + run/submit buttons, bottom = test results / console.

- [ ] **Step 4: Create ProblemsView combining list + detail**

Resizable split: narrow left panel (problem list) + wide right panel (detail). Wire into Layout.

- [ ] **Step 5: Verify and commit**

```bash
npm run dev
```

Expected: See problem list → click problem → see description + editor → write code → run → see results.

```bash
git add -A && git commit -m "feat: add problem list and solving interface"
```

### Task 10: Implement judge system

**Files:**

- Modify: `electron/ipc/problems.ts` — add judge logic
- Modify: `src/modules/problems/ProblemDetail.tsx` — add submit flow
- Modify: `src/stores/problemStore.ts` — add submission handling

- [ ] **Step 1: Implement judge in main process**

For each test case: run user code with test input as stdin, compare stdout with expected output (trimmed). Return per-case pass/fail results.

- [ ] **Step 2: Add submit flow to ProblemDetail**

Submit button runs all test cases, shows results (passed X/Y), records submission to DB. If all pass → mark as solved. If any fail → record to mistakes table.

- [ ] **Step 3: Verify and commit**

```bash
git add -A && git commit -m "feat: implement judge system with test case validation"
```

---

## Phase 5: Mistakes & Knowledge Base

### Task 11: Build mistake book module

**Files:**

- Create: `electron/ipc/mistakes.ts`
- Create: `src/modules/mistakes/MistakesView.tsx`
- Create: `src/modules/mistakes/MistakeCard.tsx`
- Create: `src/stores/mistakeStore.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create mistakes IPC**

List mistakes (with filters), get detail, trigger AI analysis (calls AI to analyze error pattern), update review count.

- [ ] **Step 2: Create MistakeCard**

Shows: problem title, error count, error types, last attempt date, AI analysis (if available). Button to re-attempt or request AI analysis.

- [ ] **Step 3: Create MistakesView**

Grid of MistakeCards, filters by error type / difficulty. Wire into Layout.

- [ ] **Step 4: Verify and commit**

```bash
git add -A && git commit -m "feat: add mistake book with AI error analysis"
```

### Task 12: Build knowledge base with RAG

**Files:**

- Create: `electron/ipc/rag.ts`
- Create: `src/modules/knowledge/KnowledgeView.tsx`
- Create: `src/modules/knowledge/DocUpload.tsx`
- Create: `src/modules/knowledge/DocList.tsx`
- Create: `src/stores/knowledgeStore.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create RAG IPC handler**

- Upload file → parse text (PDF via pdf-parse, Markdown/TXT direct read) → split into ~500 char chunks → call embedding API → store chunks + vectors in SQLite
- Search: embed query → cosine similarity against all chunks → return top-5

- [ ] **Step 2: Install pdf-parse**

```bash
npm install pdf-parse
```

- [ ] **Step 3: Create DocUpload component**

Drag-and-drop or file picker for PDF/MD/TXT. Shows upload progress. Calls IPC to process.

- [ ] **Step 4: Create DocList component**

Lists uploaded docs with chunk count, date. Delete button.

- [ ] **Step 5: Create KnowledgeView**

Combines DocList + DocUpload + a search box to test RAG queries. Wire into Layout.

- [ ] **Step 6: Integrate RAG into AI chat**

Add a toggle in ChatView: "基于知识库回答". When enabled, user messages first go through RAG search, top-5 chunks prepended to the system prompt.

- [ ] **Step 7: Verify and commit**

```bash
npm run dev
```

Expected: Upload a PDF → search for content → get relevant results → AI can answer based on uploaded docs.

```bash
git add -A && git commit -m "feat: add knowledge base with RAG retrieval"
```

---

## Phase 6: Package as .exe

### Task 13: Configure electron-builder and package

**Files:**

- Create: `electron-builder.yml`
- Modify: `package.json` — add build scripts
- Create: `resources/icons/icon.ico`

- [ ] **Step 1: Create electron-builder config**

```yaml
# electron-builder.yml
appId: com.codehelper.app
productName: CodeHelper
directories:
  output: dist-release
win:
  target: nsis
  icon: resources/icons/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerLanguages:
    - zh_CN
files:
  - '!docs/**'
  - '!resources/problems/**'
extraResources:
  - from: resources/problems
    to: problems
```

- [ ] **Step 2: Add build script to package.json**

```json
"scripts": {
  "build:win": "electron-vite build && electron-builder --win"
}
```

- [ ] **Step 3: Generate app icon**

Create a simple icon (or use a placeholder) at `resources/icons/icon.ico`.

- [ ] **Step 4: Build and test**

```bash
npm run build:win
```

Expected: `dist-release/` contains CodeHelper Setup.exe. Install and run — all features work.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: configure electron-builder for Windows exe packaging"
```
