# 测试指南

本文档介绍如何运行和编写 CodeHelper 的测试。

## 测试框架

CodeHelper 使用 [Vitest](https://vitest.dev/) 作为测试框架，配置文件为 `vitest.config.ts`。

## 运行测试

```bash
# 运行所有测试（单次）
npm test

# 监听模式（文件变化时自动重跑）
npm run test:watch

# 可视化测试界面（浏览器中查看）
npm run test:ui

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行性能基准测试
npm run bench
```

## 测试文件位置

所有测试文件位于 `tests/` 目录：

| 测试文件                   | 覆盖模块                                         |
| -------------------------- | ------------------------------------------------ |
| `labels.test.ts`           | 标签映射函数 (`src/utils/labels.ts`)             |
| `sqlUtils.test.ts`         | SQL 分割与判断 (`electron/utils/sqlUtils.ts`)    |
| `problemMeta.test.ts`      | 题目元数据推断 (`electron/utils/problemMeta.ts`) |
| `textUtils.test.ts`        | RAG 文本分块 (`electron/utils/textUtils.ts`)     |
| `codeRunner.test.ts`       | 代码运行器 (`electron/utils/codeRunner.ts`)      |
| `chatHelpers.test.ts`      | 聊天辅助函数 (`electron/utils/chatHelpers.ts`)   |
| `perfMonitor.test.ts`      | 性能监控 (`electron/utils/perfMonitor.ts`)       |
| `dbIndex.test.ts`          | 数据库连接 (`electron/db/index.ts`)              |
| `dbSchema.test.ts`         | 数据库 Schema 验证                               |
| `chatIpc.test.ts`          | 聊天 IPC 处理器 (`electron/ipc/chat.ts`)         |
| `problemsIpc.test.ts`      | 题库 IPC 处理器 (`electron/ipc/problems.ts`)     |
| `ragIpc.test.ts`           | 知识库 IPC 处理器 (`electron/ipc/rag.ts`)        |
| `electronIpc.test.ts`      | 数据库 IPC 处理器                                |
| `apiIpc.test.ts`           | 前端 IPC 调用封装 (`src/api/ipc.ts`)             |
| `appStore.test.ts`         | 全局状态 (`src/stores/appStore.ts`)              |
| `chatStore.test.ts`        | 聊天状态 (`src/stores/chatStore.ts`)             |
| `editorStore.test.ts`      | 编辑器状态 (`src/stores/editorStore.ts`)         |
| `problemStore.test.ts`     | 刷题状态 (`src/stores/problemStore.ts`)          |
| `settingsStore.test.ts`    | 设置状态 (`src/stores/settingsStore.ts`)         |
| `constants.test.ts`        | 共享常量 (`src/constants/`)                      |
| `errorBoundary.test.ts`    | 错误边界组件                                     |
| `errors.test.ts`           | 错误处理工具                                     |
| `edgeCases.test.ts`        | 边界情况测试                                     |
| `stateConsistency.test.ts` | 状态一致性测试                                   |

### 集成测试

位于 `tests/integration/` 目录：

- 刷题流程集成测试
- 聊天流程集成测试
- 编辑器流程集成测试
- 设置流程集成测试

### 基准测试

位于 `tests/benchmark/` 目录，使用 Vitest 的 `bench` 功能进行性能基准测试。

### 属性测试

位于 `tests/property/` 目录，使用基于属性的测试方法验证函数的通用性质。

## 覆盖率要求

| 指标       | 最低阈值 |
| ---------- | -------- |
| Statements | 80%      |
| Branches   | 70%      |
| Functions  | 80%      |
| Lines      | 80%      |

## 编写测试

### 基本结构

```typescript
// tests/myModule.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { myFunction } from '../src/utils/myModule'

describe('myFunction', () => {
  it('应该在参数为空时返回默认值', () => {
    expect(myFunction('')).toBe('default')
  })

  it('应该正确处理正常输入', () => {
    expect(myFunction('hello')).toBe('HELLO')
  })

  it('应该在输入为 null 时抛出异常', () => {
    expect(() => myFunction(null as any)).toThrow()
  })
})
```

### 测试 IPC 处理器

IPC 处理器测试使用模拟的 `better-sqlite3`（通过 `sql.js` 内存数据库）：

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'

describe('chat IPC', () => {
  let db: Database.Database

  beforeAll(() => {
    db = new Database(':memory:')
    // 执行 schema.sql 建表
  })

  afterAll(() => {
    db.close()
  })

  it('应该正确创建会话', () => {
    // 测试逻辑
  })
})
```

### 测试 Store

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../src/stores/appStore'

describe('appStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useAppStore.setState({ activeModule: 'editor' })
  })

  it('应该正确切换模块', () => {
    useAppStore.getState().setActiveModule('problems')
    expect(useAppStore.getState().activeModule).toBe('problems')
  })
})
```

### Mock 技巧

```typescript
import { vi } from 'vitest'

// Mock 函数
const mockInvoke = vi.fn()
vi.stubGlobal('window', { api: { invoke: mockInvoke } })

// Mock 返回值
mockInvoke.mockResolvedValue({ data: 'test' })

// 验证调用
expect(mockInvoke).toHaveBeenCalledWith('channel-name', { arg: 'value' })
```

## 测试命名规范

- 使用中文描述测试场景
- 格式：`应该<预期行为>当<条件>`
- 使用 `describe` 按功能分组
- 每个 `it` 只测试一个行为
- 示例：
  - `应该在参数为空时返回空数组`
  - `应该正确过滤难度为 easy 的题目`
  - `应该在数据库不存在记录时返回 undefined`

## CI 中的测试

项目使用 GitHub Actions 进行 CI，每次 Push 和 PR 会自动运行：

1. `npm run typecheck` - TypeScript 类型检查
2. `npm run lint` - ESLint 代码规范检查
3. `npm run format:check` - Prettier 格式检查
4. `npm test` - 全部单元测试

所有检查通过后才能合并 PR。

---

## See Also

- [测试指南 (guides)](../guides/testing.md) -- docs 目录下的测试指南
- [日常开发指南](../guides/development.md) -- 代码规范与工作流
- [调试指南](../guides/debugging.md) -- 调试方法与工具
- [IPC 通道参考](../reference/ipc-channels.md) -- 要测试的 IPC 通道
- [术语表](../glossary.md) -- Vitest、Mock 等术语
