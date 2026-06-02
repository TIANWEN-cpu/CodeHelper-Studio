# 测试指南

> **[< 上一页: 日常开发指南](development.md)** | **[下一页: 调试指南 >](debugging.md)**

本文档介绍 CodeHelper 的测试策略、编写规范和运行方式。

## 测试架构

```
tests/
├── electron/               # 主进程测试
│   ├── ipc/                # IPC 处理器测试
│   │   ├── ai.test.ts
│   │   ├── chat.test.ts
│   │   ├── database.test.ts
│   │   ├── mistakes.test.ts
│   │   ├── problems.test.ts
│   │   ├── rag.test.ts
│   │   └── runner.test.ts
│   └── db/                 # 数据库层测试
│       └── index.test.ts
├── src/                    # 渲染进程测试
│   ├── stores/             # Store 测试
│   │   ├── problemStore.test.ts
│   │   ├── editorStore.test.ts
│   │   ├── chatStore.test.ts
│   │   └── settingsStore.test.ts
│   ├── hooks/              # Hook 测试
│   └── utils/              # 工具函数测试
└── integration/            # 集成测试
    ├── problemFlow.test.ts
    ├── chatFlow.test.ts
    ├── editorFlow.test.ts
    └── settingsFlow.test.ts
```

## 测试框架

使用 **Vitest** 作为测试框架，配置文件为 `vitest.config.ts`。

```bash
# 运行全部测试
npm run test

# 监视模式（文件变更时自动重跑）
npm run test:watch

# 带 UI 的交互模式
npm run test:ui

# 生成覆盖率报告
npm run test:coverage

# 性能基准测试
npm run bench
```

## 编写测试

### 基本结构

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('模块名称', () => {
  beforeEach(() => {
    // 每个测试前的准备工作
  })

  it('应该描述预期行为', () => {
    // Arrange（准备）
    const input = {
      /* ... */
    }

    // Act（执行）
    const result = myFunction(input)

    // Assert（断言）
    expect(result).toEqual(expectedOutput)
  })
})
```

### 测试 Store

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProblemStore } from '../../src/stores/problemStore'

// Mock IPC
vi.mock('../../src/api/ipc', () => ({
  typedInvoke: vi.fn(),
}))

describe('problemStore', () => {
  beforeEach(() => {
    // 重置 Store 状态
    useProblemStore.setState({
      problems: [],
      activeProblemId: null,
      loading: false,
      loadError: null,
    })
    vi.clearAllMocks()
  })

  it('loadProblems 应该加载题目列表', async () => {
    const mockProblems = [
      { id: 1, title: '两数之和', difficulty: 'easy' },
      { id: 2, title: '三数之和', difficulty: 'medium' },
    ]

    vi.mocked(typedInvoke).mockResolvedValueOnce(mockProblems)

    await useProblemStore.getState().loadProblems()

    const state = useProblemStore.getState()
    expect(state.problems).toEqual(mockProblems)
    expect(state.loading).toBe(false)
    expect(state.loadError).toBeNull()
  })

  it('loadProblems 出错时应该设置 loadError', async () => {
    vi.mocked(typedInvoke).mockRejectedValueOnce(new Error('网络错误'))

    await useProblemStore.getState().loadProblems()

    const state = useProblemStore.getState()
    expect(state.loadError).toBe('网络错误')
    expect(state.loading).toBe(false)
  })

  it('setFilters 应该更新筛选条件并重新加载', async () => {
    vi.mocked(typedInvoke).mockResolvedValueOnce([])

    useProblemStore.getState().setFilters({ difficulty: 'hard' })

    expect(useProblemStore.getState().filters).toEqual({ difficulty: 'hard' })
    expect(typedInvoke).toHaveBeenCalledWith('problems-list', { difficulty: 'hard' })
  })
})
```

### 测试 IPC 处理器

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerProblemsIPC } from '../../../electron/ipc/problems'

// Mock better-sqlite3
vi.mock('../../../electron/db/index', () => ({
  getDB: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  })),
}))

// Mock electron
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
}))

describe('problems IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该注册所有必要的处理器', () => {
    const { ipcMain } = require('electron')
    registerProblemsIPC()

    expect(ipcMain.handle).toHaveBeenCalledWith('problems-list', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('problems-get', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('problems-submit', expect.any(Function))
  })
})
```

### 测试工具函数

```typescript
import { describe, it, expect } from 'vitest'
import { toErrorMessage, categorizeError, safeAsync } from '../../src/utils/errors'

describe('toErrorMessage', () => {
  it('应该提取 Error 实例的 message', () => {
    expect(toErrorMessage(new Error('test error'))).toBe('test error')
  })

  it('应该直接返回字符串', () => {
    expect(toErrorMessage('string error')).toBe('string error')
  })

  it('应该处理未知类型', () => {
    expect(toErrorMessage(42)).toBe('42')
    expect(toErrorMessage(null)).toBe('null')
  })
})

describe('categorizeError', () => {
  it('应该识别网络错误', () => {
    expect(categorizeError(new Error('fetch failed'))).toBe('network')
    expect(categorizeError(new Error('ECONNREFUSED'))).toBe('network')
  })

  it('应该识别认证错误', () => {
    expect(categorizeError(new Error('401 Unauthorized'))).toBe('auth')
  })

  it('应该识别超时错误', () => {
    expect(categorizeError(new Error('request timed out'))).toBe('timeout')
  })
})

describe('safeAsync', () => {
  it('成功时返回 [data, null]', async () => {
    const [data, err] = await safeAsync(async () => 42)
    expect(data).toBe(42)
    expect(err).toBeNull()
  })

  it('失败时返回 [null, Error]', async () => {
    const [data, err] = await safeAsync(async () => {
      throw new Error('fail')
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toBe('fail')
  })
})
```

### 测试 Hooks

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCodeExecution } from '../../src/hooks/useCodeExecution'

vi.mock('../../src/api/ipc', () => ({
  typedInvoke: vi.fn(),
}))

describe('useCodeExecution', () => {
  it('应该正确管理执行状态', async () => {
    vi.mocked(typedInvoke).mockResolvedValueOnce({
      stdout: 'Hello\n',
      stderr: '',
      exitCode: 0,
    })

    const { result } = renderHook(() => useCodeExecution())

    expect(result.current.running).toBe(false)
    expect(result.current.output).toBeNull()

    await act(async () => {
      await result.current.execute('print("Hello")', 'python')
    })

    expect(result.current.running).toBe(false)
    expect(result.current.output).toEqual({ stdout: 'Hello\n', stderr: '' })
  })
})
```

## Mock 策略

### Mock Electron IPC

```typescript
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => '/tmp/test'),
    isPackaged: false,
  },
  BrowserWindow: vi.fn(),
  shell: { openExternal: vi.fn() },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString()),
  },
}))
```

### Mock 数据库

```typescript
vi.mock('../../../electron/db/index', () => {
  const mockDB = {
    prepare: vi.fn(() => ({
      get: vi.fn(),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn(),
  }
  return { getDB: vi.fn(() => mockDB), closeDB: vi.fn() }
})
```

### Mock typedInvoke

```typescript
vi.mock('../../src/api/ipc', () => ({
  typedInvoke: vi.fn(),
  typedOn: vi.fn(() => vi.fn()), // 返回取消订阅函数
}))
```

## 覆盖率

运行 `npm run test:coverage` 生成覆盖率报告。目标覆盖率：

| 指标       | 目标 |
| ---------- | ---- |
| 语句覆盖率 | 80%+ |
| 分支覆盖率 | 75%+ |
| 函数覆盖率 | 80%+ |
| 行覆盖率   | 80%+ |

覆盖率报告输出到 `coverage/` 目录，包含 HTML 格式的可视化报告。

## 最佳实践

1. **测试命名**：使用 "应该xxx" 格式描述预期行为
2. **AAA 模式**：Arrange（准备）、Act（执行）、Assert（断言）
3. **一个测试一个断言主题**：每个测试只验证一个行为
4. **Mock 粒度**：Mock 外部依赖（IPC、数据库），不 Mock 内部逻辑
5. **清理状态**：在 `beforeEach` 中重置 Store 和 Mock
6. **避免测试实现细节**：测试行为而非实现

---

## See Also

- [快速上手](getting-started.md) -- 环境搭建与常用命令
- [日常开发指南](development.md) -- 代码规范与 Git 工作流
- [调试指南](debugging.md) -- 调试方法与常见场景
- [IPC 通道参考](../reference/ipc-channels.md) -- 了解要测试的 IPC 通道
- [Zustand Stores 参考](../reference/stores.md) -- Store 字段与 Actions
- [工具函数参考](../reference/utils.md) -- 需要测试的工具函数
- [CONTRIBUTING.md](../../CONTRIBUTING.md) -- 测试要求与覆盖率标准
