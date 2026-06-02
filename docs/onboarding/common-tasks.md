# 常见任务指南

本文档提供 CodeHelper 开发中常见任务的详细步骤，可作为日常开发的参考手册。

---

## 目录

- [添加一个新的 IPC 通道](#添加一个新的-ipc-通道)
- [添加一个新的 React 组件](#添加一个新的-react-组件)
- [添加一个新的 Zustand Store](#添加一个新的-zustand-store)
- [添加一个新的测试](#添加一个新的-测试)
- [添加一个新的功能模块](#添加一个新的-功能模块)
- [添加一个新的数据库表](#添加一个新的-数据库表)

---

## 添加一个新的 IPC 通道

以下以添加一个 `notes-list` 通道为例，展示完整步骤。

### 第 1 步：定义通道名常量

编辑 `src/constants/index.ts`，在 `IPC` 对象中添加：

```typescript
export const IPC = {
  // ...已有通道
  /** 笔记模块 */
  NOTES_LIST: 'notes-list',
} as const
```

### 第 2 步：添加类型定义

编辑 `src/types/ipc.ts`，在 `IpcChannelMap` 中添加：

```typescript
interface IpcChannelMap {
  // ...已有映射
  'notes-list': {
    args: []
    result: NoteSummary[]
  }
}
```

如果需要新的数据类型，在同一文件或 `src/types/` 下的相关文件中定义。

### 第 3 步：注册到白名单

编辑 `electron/preload.ts`，在 `allowedInvokeChannels` 集合中添加：

```typescript
const allowedInvokeChannels = new Set([
  // ...已有通道
  'notes-list',
])
```

### 第 4 步：实现 IPC 处理器

在 `electron/ipc/` 下创建或编辑对应文件：

```typescript
// electron/ipc/notes.ts
import { ipcMain } from 'electron'
import { getDb } from '../db/db'

export function registerNotesIpc(): void {
  ipcMain.handle('notes-list', async () => {
    const db = getDb()
    const rows = db
      .prepare('SELECT id, title, created_at FROM notes ORDER BY updated_at DESC')
      .all()
    return rows
  })
}
```

### 第 5 步：注册处理器

在 `electron/main.ts` 中导入并调用：

```typescript
import { registerNotesIpc } from './ipc/notes'

// 在 app.whenReady() 或合适的位置调用
registerNotesIpc()
```

### 第 6 步：在 Store 中调用

```typescript
// src/stores/notesStore.ts
import { create } from 'zustand'
import { typedInvoke } from '../api/ipc'

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  fetchNotes: async () => {
    const notes = await typedInvoke('notes-list')
    set({ notes })
  },
}))
```

### 第 7 步：验证

```bash
npm run typecheck  # 确认类型正确
npm run lint       # 确认代码规范
npm test           # 确认无回归
```

---

## 添加一个新的 React 组件

### 文件位置

- 通用组件放在 `src/components/`
- 功能模块组件放在 `src/modules/<模块名>/`

### 组件模板

```tsx
// src/components/NoteCard.tsx
import React, { memo } from 'react'

interface NoteCardProps {
  title: string
  content: string
  onClick: () => void
}

export const NoteCard: React.FC<NoteCardProps> = memo(function NoteCard({
  title,
  content,
  onClick,
}) {
  return (
    <div
      className="cursor-pointer rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50"
      onClick={onClick}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-neutral-600">{content}</p>
    </div>
  )
})
```

### 组件开发规范

1. **使用 `memo` 包裹**：避免不必要的重渲染，尤其是列表中的子组件
2. **明确 Props 类型**：使用 `interface` 定义，不使用内联类型
3. **命名规范**：组件使用 PascalCase，Props 接口以 `Props` 结尾
4. **样式**：使用 Tailwind CSS 类名，不使用内联样式
5. **导出方式**：使用具名导出（`export const`），不使用默认导出

### 将组件集成到模块

如果是新模块的组件：

1. 在 `src/modules/<模块名>/` 下创建组件文件
2. 在 `src/components/Layout.tsx` 中添加模块路由映射
3. 在 `src/components/Sidebar.tsx` 中添加导航入口

---

## 添加一个新的 Zustand Store

### Store 模板

```typescript
// src/stores/notesStore.ts
import { create } from 'zustand'
import { typedInvoke, invalidateCache } from '../api/ipc'

interface Note {
  id: number
  title: string
  content: string
}

interface NotesState {
  notes: Note[]
  currentNote: Note | null
  loading: boolean
  error: string | null

  // Actions
  fetchNotes: () => Promise<void>
  createNote: (title: string, content: string) => Promise<void>
  deleteNote: (id: number) => Promise<void>
  setCurrentNote: (note: Note | null) => void
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  currentNote: null,
  loading: false,
  error: null,

  fetchNotes: async () => {
    set({ loading: true, error: null })
    try {
      const notes = await typedInvoke('notes-list')
      set({ notes, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '获取笔记列表失败',
        loading: false,
      })
    }
  },

  createNote: async (title, content) => {
    try {
      await typedInvoke('notes-create', title, content)
      invalidateCache('notes-list')
      await get().fetchNotes()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '创建笔记失败' })
    }
  },

  deleteNote: async (id) => {
    try {
      await typedInvoke('notes-delete', id)
      invalidateCache('notes-list')
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
        currentNote: state.currentNote?.id === id ? null : state.currentNote,
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '删除笔记失败' })
    }
  },

  setCurrentNote: (note) => set({ currentNote: note }),
}))
```

### Store 开发规范

1. **接口定义在前**：先定义 State 接口，再实现 store
2. **错误处理**：所有异步操作使用 try/catch，将错误信息存入 state
3. **缓存失效**：写操作后调用 `invalidateCache` 清除相关缓存
4. **乐观更新**：删除等操作可先更新 UI 再确认后端操作
5. **文件命名**：`<模块名>Store.ts`，使用 camelCase

---

## 添加一个新的测试

### 测试文件位置

所有测试文件放在 `tests/` 目录下，命名格式为 `<模块名>.test.ts`。

### 工具函数测试

```typescript
// tests/notesHelper.test.ts
import { describe, it, expect } from 'vitest'
import { formatNoteTitle, truncateContent } from '../src/utils/notesHelper'

describe('formatNoteTitle', () => {
  it('应该返回原始标题（长度在限制内）', () => {
    expect(formatNoteTitle('短标题', 20)).toBe('短标题')
  })

  it('应该在标题超出限制时截断并添加省略号', () => {
    expect(formatNoteTitle('这是一个很长很长的标题', 10)).toBe('这是一个很长很长的...')
  })

  it('应该处理空字符串', () => {
    expect(formatNoteTitle('', 20)).toBe('')
  })
})

describe('truncateContent', () => {
  it('应该在内容超出限制时截断', () => {
    const longContent = 'a'.repeat(200)
    expect(truncateContent(longContent, 100)).toHaveLength(103) // 100 + '...'
  })

  it('应该在内容未超出限制时返回原始内容', () => {
    expect(truncateContent('短内容', 100)).toBe('短内容')
  })
})
```

### Store 测试

```typescript
// tests/notesStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNotesStore } from '../src/stores/notesStore'

// 模拟 typedInvoke
vi.mock('../src/api/ipc', () => ({
  typedInvoke: vi.fn(),
  invalidateCache: vi.fn(),
}))

import { typedInvoke } from '../src/api/ipc'

describe('useNotesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNotesStore.setState({
      notes: [],
      currentNote: null,
      loading: false,
      error: null,
    })
  })

  it('fetchNotes 应该加载笔记列表', async () => {
    const mockNotes = [{ id: 1, title: '测试笔记', content: '内容' }]
    vi.mocked(typedInvoke).mockResolvedValue(mockNotes)

    await useNotesStore.getState().fetchNotes()

    expect(useNotesStore.getState().notes).toEqual(mockNotes)
    expect(useNotesStore.getState().loading).toBe(false)
  })

  it('fetchNotes 应该在失败时设置错误信息', async () => {
    vi.mocked(typedInvoke).mockRejectedValue(new Error('网络错误'))

    await useNotesStore.getState().fetchNotes()

    expect(useNotesStore.getState().error).toBe('网络错误')
    expect(useNotesStore.getState().loading).toBe(false)
  })
})
```

### IPC Handler 测试

```typescript
// tests/notesIpc.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 模拟 electron
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

// 模拟数据库
vi.mock('../electron/db/db', () => ({
  getDb: () => ({
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([{ id: 1, title: '测试' }]),
    }),
  }),
}))
```

### 测试编写规范

1. **描述使用中文**：`it('应该在参数为空时返回默认值')`
2. **每个 it 只测一个行为**：保持测试原子性
3. **使用 describe 分组**：按功能或方法分组
4. **使用 beforeEach 重置**：确保测试间互相独立
5. **Mock 外部依赖**：使用 `vi.mock` 模拟 IPC、数据库等

### 运行测试

```bash
npm test                    # 运行所有测试
npm run test:watch          # 监听模式（开发时推荐）
npm run test:coverage       # 生成覆盖率报告
```

---

## 添加一个新的功能模块

以添加"笔记"模块为例。

### 第 1 步：创建模块目录

```
src/modules/notes/
├── NotesView.tsx       # 主页面组件
├── NoteEditor.tsx      # 笔记编辑器
└── NoteList.tsx        # 笔记列表
```

### 第 2 步：创建 Store

在 `src/stores/notesStore.ts` 中创建对应的 Zustand store。

### 第 3 步：定义常量

在 `src/constants/index.ts` 中添加模块 ID 和标签：

```typescript
export type ModuleId =
  | 'problems'
  | 'editor'
  | 'ai-chat'
  | 'mistakes'
  | 'knowledge'
  | 'settings'
  | 'stats'
  | 'search'
  | 'notes' // 新增

export const MODULE_LABELS: Record<string, string> = {
  // ...已有标签
  notes: '笔记',
}
```

### 第 4 步：注册路由

在 `src/components/Layout.tsx` 中添加模块路由映射。

### 第 5 步：添加导航入口

在 `src/components/Sidebar.tsx` 中添加笔记模块的导航项。

### 第 6 步：实现 IPC 通道

按照"添加 IPC 通道"的步骤，为笔记模块添加所需的后端通道。

### 第 7 步：编写测试

为 store 和工具函数编写单元测试。

---

## 添加一个新的数据库表

### 第 1 步：定义 Schema

在 `electron/db/schema.sql` 中添加建表语句：

```sql
CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL DEFAULT '',
  content    TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
```

### 第 2 步：验证迁移

数据库 Schema 在应用启动时自动执行（使用 `IF NOT EXISTS` 确保幂等性）。启动应用后验证表已创建：

```bash
# 使用 DB Browser for SQLite 打开数据库文件查看
# Windows: %APPDATA%/codehelper/codehelper.db
```

### 第 3 步：编写数据访问代码

在 IPC handler 中编写 CRUD 操作，注意使用参数化查询防止 SQL 注入：

```typescript
const insertNote = db.prepare('INSERT INTO notes (title, content) VALUES (?, ?)')
insertNote.run(title, content)
```

---

## 常用开发命令速查

| 命令                    | 用途                |
| ----------------------- | ------------------- |
| `npm run dev`           | 启动开发服务器      |
| `npm run typecheck`     | TypeScript 类型检查 |
| `npm run lint`          | ESLint 检查         |
| `npm run lint:fix`      | ESLint 自动修复     |
| `npm run format`        | Prettier 格式化     |
| `npm run format:check`  | Prettier 格式检查   |
| `npm test`              | 运行测试            |
| `npm run test:watch`    | 测试监听模式        |
| `npm run test:coverage` | 测试覆盖率报告      |
| `npm run build`         | 构建生产版本        |

---

## 相关文档

- [week-1.md](./week-1.md) - 第一周指南
- [architecture-walkthrough.md](./architecture-walkthrough.md) - 架构深入解析
- [coding-standards.md](./coding-standards.md) - 编码规范
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - 贡献指南
