# 日常开发指南

> **[< 上一页: 快速上手](getting-started.md)** | **[下一页: 测试指南 >](testing.md)**

本文档介绍 CodeHelper 的日常开发工作流，包括分支策略、代码规范、Git 提交规范。

## Git 工作流

### 分支策略

```
main (生产分支)
  │
  ├── feature/xxx     功能分支
  ├── fix/xxx         修复分支
  ├── refactor/xxx    重构分支
  └── docs/xxx        文档分支
```

- `main`：稳定分支，始终可构建和发布
- 功能分支：从 `main` 创建，完成后通过 PR 合并回 `main`

### 创建功能分支

```bash
# 从 main 创建功能分支
git checkout main
git pull
git checkout -b feature/my-feature

# 开发完成后推送
git push -u origin feature/my-feature
```

### 提交规范

使用约定式提交（Conventional Commits）格式：

```
<type>(<scope>): <subject>

[body]

[footer]
```

**类型**：

| 类型       | 说明                   |
| ---------- | ---------------------- |
| `feat`     | 新功能                 |
| `fix`      | 修复 Bug               |
| `refactor` | 代码重构（不改变功能） |
| `docs`     | 文档更新               |
| `style`    | 代码格式（不影响功能） |
| `test`     | 测试相关               |
| `chore`    | 构建/工具/配置变更     |
| `perf`     | 性能优化               |

**示例**：

```
feat(problems): 添加题目筛选功能

支持按难度、标签、来源筛选题目列表。

Closes #123
```

```
fix(chat): 修复流式响应乱序问题

使用 requestId 匹配机制，确保 chunk 正确追加到当前消息。
```

### Git Hooks

项目使用 Husky + lint-staged 在提交前自动执行检查：

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --no-warn-ignored", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

提交时会自动：

1. 对 `.ts` / `.tsx` 文件运行 ESLint 修复
2. 对所有文件运行 Prettier 格式化

如需跳过 hooks（不推荐）：`git commit --no-verify`

## 代码规范

### TypeScript 规范

```typescript
// 1. 使用 interface 而非 type 定义对象类型
interface AppState {
  count: number
  items: Item[]
}

// 2. 导出类型时使用 export type
export type { Problem, Submission }

// 3. 函数参数和返回值标注类型
function processItem(item: Item): ProcessedItem {
  // ...
}

// 4. 使用 unknown 而非 any
function handleError(error: unknown) {
  const msg = toErrorMessage(error)
}
```

### React 规范

```typescript
// 1. 使用函数组件 + Hooks
export function MyComponent({ title }: Props) {
  const [count, setCount] = useState(0)
  return <div>{title}: {count}</div>
}

// 2. 使用 memo 避免不必要的重渲染
const ExpensiveChild = memo(function ExpensiveChild({ data }: Props) {
  return <div>{/* 复杂渲染 */}</div>
})

// 3. 使用 useCallback 稳定回调
const handleClick = useCallback(() => {
  doSomething(id)
}, [id])

// 4. 使用 useMemo 缓存计算结果
const filtered = useMemo(() => items.filter(filterFn), [items, filterFn])
```

### Store 规范

```typescript
// 1. Store 命名：use<Domain>Store
export const useProblemStore = create<ProblemState>((set, get) => ({ ... }))

// 2. 异步操作统一错误处理
loadData: async () => {
  set({ loading: true, error: null })
  try {
    const data = await typedInvoke('my-channel')
    set({ data })
  } catch (error: unknown) {
    set({ error: toErrorMessage(error) })
  } finally {
    set({ loading: false })
  }
}

// 3. 使用 typedInvoke 替代直接调用
const result = await typedInvoke('problems-list', filters)
```

### 样式规范

使用 Tailwind CSS 原子化类名，主题变量通过 CSS 变量引用：

```tsx
// 使用主题变量
<div className="bg-[var(--theme-bg-app)] text-[var(--theme-text-primary)]">
  <button className="bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] rounded-lg px-4 py-2">
    按钮
  </button>
</div>

// 使用 Tailwind 条件类名
className={`px-4 py-2 ${isActive ? 'bg-[var(--theme-accent)]' : 'bg-transparent'}`}
```

## 文件组织

### 新增模块

1. 在 `src/modules/<name>/` 创建目录
2. 创建主视图组件 `XxxView.tsx`
3. 如需要，在 `src/stores/` 创建对应的 Store
4. 在 `src/components/Layout.tsx` 添加路由映射
5. 在 `src/components/Sidebar.tsx` 的 `SIDEBAR_NAV_ITEMS` 添加导航项
6. 在 `src/constants/index.ts` 的 `MODULE_LABELS` 添加模块标签

### 新增 IPC 通道

1. 在 `src/types/ipc.ts` 的 `IpcChannelMap` 中定义通道类型
2. 在 `electron/preload.ts` 的 `allowedInvokeChannels` 白名单中添加
3. 在对应的 `electron/ipc/*.ts` 中实现处理器
4. 在 Store 中使用 `typedInvoke()` 调用

### 新增数据库表

1. 在 `electron/db/schema.sql` 中添加 `CREATE TABLE` 语句
2. 在 `electron/types/db.ts` 中添加行类型定义
3. 在对应的 `electron/ipc/*.ts` 中实现 CRUD 操作

## 调试技巧

### 渲染进程调试

```bash
# 启动开发模式
npm run dev

# 在应用中按 Ctrl+Shift+I 打开 DevTools
# 或通过菜单：视图 → 切换开发者工具
```

### 主进程调试

```bash
# 方法 1：使用 VS Code 调试
# 在 .vscode/launch.json 中配置 Electron 主进程调试

# 方法 2：使用 --inspect 参数
# 修改 electron-vite dev 命令加上 --inspect

# 主进程日志输出到终端（运行 npm run dev 的那个终端）
console.log('[debug]', data)
console.warn('[perf] Slow operation:', duration)
```

### IPC 调试

主进程的 IPC 处理器有内置的性能监控。每 5 分钟会在终端输出统计信息：

```
[perf] IPC Call Statistics:
  Channel                  | Calls | Avg (ms) | Slow | Last Called
  -------------------------|-------|----------|------|------------
  problems-list            |    12 |     5.3  |    0 | 14:30:25
  ai-chat                  |     3 |  2341.2  |    3 | 14:28:10
```

也可通过 `perf-get-ipc-stats` 通道在渲染进程中查询。

## 常见开发场景

### 添加新的筛选条件

1. 在 `src/types/problem.ts` 的 `ProblemFilters` 中添加字段
2. 在 `electron/ipc/problems.ts` 的查询构建逻辑中添加 WHERE 条件
3. 在 UI 组件中添加筛选控件
4. 调用 `problemStore.setFilters()` 触发查询

### 添加新的主题

1. 在 `src/theme/themes.ts` 中定义新的主题变量
2. 在 `src/constants/index.ts` 的 `THEMES` 数组中添加主题 ID
3. 在设置页面的主题选择器中添加选项

### 修改数据库 Schema

1. 在 `electron/db/schema.sql` 中添加新表或新列
2. 如果是新列，需要在 `electron/db/index.ts` 的 `ensureSchemaColumns()` 中添加迁移逻辑
3. 更新 `electron/types/db.ts` 中的行类型

---

## See Also

- [快速上手](getting-started.md) -- 环境搭建与首次运行
- [测试指南](testing.md) -- 测试编写规范与 Mock 策略
- [调试指南](debugging.md) -- 调试方法与工具
- [贡献指南](contributing.md) -- 完整的贡献流程与 PR 规范
- [IPC 通信模式](../concepts/ipc-patterns.md) -- IPC 通道类型安全详解
- [状态管理](../concepts/state-management.md) -- Zustand Store 最佳实践
- [组件参考](../reference/components.md) -- React 组件树参考
- [工具函数参考](../reference/utils.md) -- 通用工具函数
