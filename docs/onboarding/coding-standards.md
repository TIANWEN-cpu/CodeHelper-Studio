# 编码规范

本文档定义了 CodeHelper 项目的编码规范，所有贡献者都应遵守。项目使用 ESLint + Prettier 自动强制执行大部分规则。

---

## 目录

- [命名规范](#命名规范)
- [文件组织](#文件组织)
- [TypeScript 规范](#typescript-规范)
- [React 规范](#react-规范)
- [样式规范](#样式规范)
- [提交规范](#提交规范)
- [PR 审查清单](#pr-审查清单)

---

## 命名规范

### 通用规则

| 类型         | 规范             | 示例                                      |
| ------------ | ---------------- | ----------------------------------------- |
| 变量 / 函数  | camelCase        | `fetchProblems`, `isLoading`              |
| 常量         | UPPER_SNAKE_CASE | `DEFAULT_THEME`, `IPC`                    |
| 类型 / 接口  | PascalCase       | `ProblemDetail`, `IpcChannelMap`          |
| 组件         | PascalCase       | `ProblemList`, `MonacoEditor`             |
| 文件（组件） | PascalCase.tsx   | `ProblemList.tsx`, `ChatView.tsx`         |
| 文件（其他） | camelCase.ts     | `appStore.ts`, `chatHelpers.ts`           |
| 测试文件     | <模块名>.test.ts | `chatStore.test.ts`, `codeRunner.test.ts` |
| CSS 类名     | Tailwind 工具类  | `rounded-lg p-4 text-sm`                  |

### 变量命名

- **布尔变量**以 `is`、`has`、`should`、`can` 开头：`isLoading`, `hasError`, `shouldRetry`
- **回调函数**以 `on` 或 `handle` 开头：`onSubmit`, `handleClick`
- **私有变量/未使用参数**以 `_` 前缀命名：`_unusedParam`
- **集合变量**使用复数名词：`items`, `messages`, `problems`
- **单个元素**使用单数名词：`item`, `message`, `problem`

### 常量命名

- **IPC 通道名**定义在 `src/constants/index.ts` 的 `IPC` 对象中，使用 `UPPER_SNAKE_CASE`
- **通道字符串值**使用 `kebab-case`：`'problems-list'`, `'chat-session-create'`
- **枚举/集合**使用 `as const` 确保类型安全

---

## 文件组织

### 目录结构

```
src/
├── api/              # IPC 调用封装（仅 typedInvoke、typedOn）
├── assets/           # 静态资源（CSS 等）
├── components/       # 通用 UI 组件（跨模块复用）
├── constants/        # 共享常量
├── hooks/            # 自定义 React Hooks
├── modules/          # 功能模块（每个模块一个子目录）
│   └── <模块名>/
│       ├── <View>.tsx     # 模块主页面
│       └── <子组件>.tsx   # 模块内部组件
├── plugins/          # 插件架构
├── services/         # 前端服务层（封装复杂业务逻辑）
├── stores/           # Zustand stores（一个模块一个 store）
├── theme/            # 主题配置
├── types/            # 共享 TypeScript 类型
└── utils/            # 纯函数工具
```

### 导入顺序

在每个文件中，导入语句按以下顺序排列，各组之间用空行分隔：

```typescript
// 1. 第三方库
import React, { useState, useEffect } from 'react'
import { create } from 'zustand'
import { ChevronRight } from 'lucide-react'

// 2. 内部工具和类型
import { typedInvoke } from '../api/ipc'
import type { ProblemDetail } from '../types/problem'
import { IPC } from '../constants'

// 3. 组件
import { LoadingSpinner } from '../components/LoadingSpinner'

// 4. 本地模块
import { useProblemStore } from '../stores/problemStore'
```

### 文件大小

- 单个文件不超过 **300 行**（推荐 200 行以内）
- 超过时考虑拆分为子组件或提取工具函数
- Store 文件超过 200 行时考虑拆分 action 或提取 service

---

## TypeScript 规范

### 基本规则

- **严格模式**：项目启用 `strict: true`，不允许隐式 `any`
- **显式类型标注**：函数参数必须显式标注类型
- **返回值类型**：公共函数建议标注返回值类型
- **`no-explicit-any`**：设为警告级别，尽量避免使用

### 类型定义

```typescript
// 推荐：使用 interface 定义对象类型
interface ProblemSummary {
  id: number
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
}

// 推荐：使用 type 定义联合类型或工具类型
type Difficulty = 'easy' | 'medium' | 'hard'
type ProblemCreateInput = Omit<ProblemSummary, 'id'>

// 避免：使用 enum（推荐使用 const 对象替代）
const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
} as const
type Difficulty = (typeof DIFFICULTY)[keyof typeof DIFFICULTY]
```

### 泛型

```typescript
// 推荐：约束泛型范围
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}

// 避免：无约束的泛型
function getProperty(obj: any, key: string): any { ... }
```

### 空值处理

```typescript
// 推荐：使用可选链和空值合并
const title = problem?.title ?? '未命名'

// 避免：手动检查 null/undefined
const title = problem && problem.title ? problem.title : '未命名'
```

---

## React 规范

### 组件编写

```typescript
// 推荐：函数组件 + memo + 具名导出
export const ProblemCard: React.FC<ProblemCardProps> = memo(function ProblemCard({
  problem,
  onSelect,
}) {
  return (
    <div onClick={() => onSelect(problem.id)}>
      {problem.title}
    </div>
  )
})

// 避免：匿名组件 + 默认导出
export default function({ problem, onSelect }) { ... }
```

### Hooks 使用

```typescript
// 推荐：使用 store selector 精确订阅
const title = useAppStore((s) => s.title)

// 避免：订阅整个 store
const store = useAppStore()
// 然后使用 store.title, store.loading 等（会导致不必要的重渲染）
```

### 性能优化

- 列表子组件使用 `memo` 包裹
- 传递给子组件的回调使用 `useCallback`
- 昂贵的计算结果使用 `useMemo`
- 列表渲染提供稳定的 `key`（使用 id 而非 index）

### 错误处理

- 路由组件外层包裹 `ErrorBoundary`
- 异步操作使用 try/catch
- 用户可见的错误使用 Toast/通知展示
- 不要静默吞掉错误（至少 `console.warn`）

---

## 样式规范

### Tailwind CSS

- 使用 Tailwind 工具类，不写自定义 CSS
- 使用 `className` 属性，不使用 `style` 属性
- 复杂条件样式使用模板字符串或三元表达式

```typescript
// 推荐
<div className={`p-4 ${isActive ? 'bg-blue-500' : 'bg-gray-100'}`}>

// 避免
<div style={{ padding: 16, backgroundColor: isActive ? '#3B82F6' : '#F3F4F6' }}>
```

### 主题适配

- 使用 CSS 变量实现主题切换
- 可用主题：`mocha`（默认）、`fjord`、`ember`
- 通过 `document.documentElement.dataset.theme` 切换主题

---

## 提交规范

### Commit 格式

采用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>
```

### type 类型

| type       | 用途                   | 示例                                    |
| ---------- | ---------------------- | --------------------------------------- |
| `feat`     | 新功能                 | `feat(problems): 新增数学建模题库`      |
| `fix`      | Bug 修复               | `fix(rag): 修复文档分块越界`            |
| `docs`     | 文档                   | `docs(readme): 补充开发环境说明`        |
| `style`    | 格式调整（不影响逻辑） | `style: 运行 Prettier 格式化`           |
| `refactor` | 重构                   | `refactor(ipc): 提取判题逻辑到 service` |
| `test`     | 测试                   | `test(chat): 添加会话创建测试`          |
| `chore`    | 构建/工具              | `chore(deps): 升级 electron 到 v41`     |

### scope 范围

常用 scope 与目录对应：

| scope               | 对应模块   |
| ------------------- | ---------- |
| `problems`          | 刷题系统   |
| `editor`            | 代码编辑器 |
| `chat` / `ai`       | AI 助手    |
| `mistakes`          | 错题本     |
| `knowledge` / `rag` | 知识库     |
| `settings`          | 设置       |
| `ipc`               | IPC 通信层 |
| `db`                | 数据库层   |
| `store`             | 状态管理   |
| `test`              | 测试相关   |
| `deps`              | 依赖更新   |

### description 规范

- 使用中文描述（与项目文档保持一致）
- 不超过 72 个字符
- 使用祈使语气（"添加"而非"添加了"）

---

## PR 审查清单

提交 PR 前，确保以下所有检查项通过：

### 自动化检查

- [ ] `npm run typecheck` 通过，无类型错误
- [ ] `npm run lint` 无错误
- [ ] `npm run format:check` 通过
- [ ] `npm test` 全部通过

### 代码质量

- [ ] 无硬编码的 API Key 或敏感信息
- [ ] 无遗留的 `console.log` 调试语句（`console.warn` 和 `console.error` 可保留）
- [ ] 无未使用的导入和变量
- [ ] 无 `// @ts-ignore` 或 `// eslint-disable` 注释（除非有充分理由并注明）
- [ ] 函数和组件的复杂度合理，单个函数不超过 50 行

### 类型安全

- [ ] 所有函数参数有显式类型标注
- [ ] 新增的 IPC 通道在 `IpcChannelMap` 中有类型定义
- [ ] Store 的 State 接口完整定义了所有字段和方法
- [ ] 不使用 `as any` 类型断言

### 测试覆盖

- [ ] 新增的纯函数有对应的单元测试
- [ ] 新增/修改的 Store action 有对应的测试
- [ ] 新增的 IPC handler 有对应的测试
- [ ] 测试描述使用中文

### 架构规范

- [ ] 新组件放在正确的目录（通用组件 → `components/`，模块组件 → `modules/`）
- [ ] 新 store 放在 `src/stores/`，命名符合 `<模块名>Store.ts`
- [ ] IPC 通道名遵循 `kebab-case` 规范
- [ ] 新的 IPC 通道已添加到 preload 白名单

### PR 描述

- [ ] 说明了改动的目的和背景
- [ ] 列出了具体的改动内容
- [ ] 说明了测试情况
- [ ] 关联了相关的 Issue（如有）

---

## 代码格式化

项目使用 Prettier 自动格式化代码，以下规则由 Prettier 强制执行：

| 配置项 | 值       |
| ------ | -------- |
| 单引号 | 是       |
| 分号   | 否       |
| 行宽   | 100 字符 |
| 缩进   | 2 空格   |
| 尾逗号 | ES5 风格 |

提交代码时，pre-commit hooks（Husky + lint-staged）会自动格式化变更的文件。手动格式化：

```bash
npm run format         # 格式化所有文件
npm run format:check   # 仅检查（CI 中使用）
```

---

## 相关文档

- [week-1.md](./week-1.md) - 第一周指南
- [architecture-walkthrough.md](./architecture-walkthrough.md) - 架构深入解析
- [common-tasks.md](./common-tasks.md) - 常见任务指南
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - 贡献指南
