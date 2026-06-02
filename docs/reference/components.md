# React 组件参考

本文档列出 CodeHelper 中的 React 组件树、Props 和使用方式。

## 组件层次结构

```
App
├── ErrorBoundary              # 全局错误边界
│   └── ToastProvider          # 通知系统
│       └── Layout             # 主布局
│           ├── Sidebar        # 左侧导航栏
│           ├── [ActiveModule] # 当前活动模块视图
│           │   ├── ProblemsView
│           │   │   ├── ProblemList
│           │   │   ├── ProblemDetail
│           │   │   └── AISidebar
│           │   ├── EditorView
│           │   │   ├── EditorTabs
│           │   │   ├── MonacoEditor
│           │   │   ├── Console
│           │   │   └── TerminalPanel
│           │   ├── ChatView
│           │   │   ├── SessionList
│           │   │   └── MessageBubble
│           │   ├── MistakesView
│           │   ├── KnowledgeView
│           │   ├── SettingsView
│           │   ├── StatsView
│           │   └── GlobalSearchView
│           ├── StatusBar      # 底部状态栏
│           ├── CommandPalette # 命令面板 (Ctrl+Shift+P)
│           └── GlobalSearch   # 全局搜索 (Ctrl+P)
```

## 通用组件

### ErrorBoundary

全局错误边界，捕获子组件树中的渲染错误。

```tsx
<ErrorBoundary>
  <Layout />
</ErrorBoundary>
```

- 捕获渲染阶段的错误
- 显示友好的错误 UI
- 提供 "重新加载" 按钮

---

### ToastProvider

通知系统，通过 Context 提供 `showToast()` 方法。

```tsx
;<ToastProvider>
  <App />
</ToastProvider>

// 在子组件中使用
const { showToast } = useToast()
showToast('保存成功', 'success')
showToast('网络错误', 'error')
```

**类型**：

- `success` — 成功通知（绿色）
- `error` — 错误通知（红色）
- `info` — 信息通知（蓝色）

---

### LoadingSpinner

加载指示器。

```tsx
<LoadingSpinner />
<LoadingSpinner size="sm" />
```

---

### EmptyState

空状态占位组件。

```tsx
<EmptyState icon={BookOpen} title="暂无题目" description="导入题目后将在这里显示" />
```

---

### ErrorWithRetry

带重试按钮的错误展示。

```tsx
<ErrorWithRetry message="加载失败" onRetry={() => loadProblems()} />
```

---

### StatusBar

底部状态栏，显示当前模块、主题、编辑器状态等。

```tsx
// 由 Layout 自动渲染
// 显示信息：当前模块名、主题、行列号、语言
```

---

### CommandPalette

命令面板，通过 `Ctrl+Shift+P` 打开。

- 搜索并执行命令
- 支持模糊匹配
- 键盘导航（上/下箭头、回车）

---

### GlobalSearch

全局搜索，通过 `Ctrl+P` 打开。

- 搜索题目、聊天、文档
- 快速跳转到目标

## 侧栏组件

### Sidebar

左侧垂直导航栏。

```tsx
<Sidebar />
```

导航项定义：

```typescript
export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  { id: 'problems', icon: BookOpen, label: '刷题' },
  { id: 'editor', icon: Code2, label: '编辑器' },
  { id: 'ai-chat', icon: Bot, label: 'AI助手' },
  { id: 'mistakes', icon: XCircle, label: '错题本' },
  { id: 'knowledge', icon: Library, label: '知识库' },
  { id: 'stats', icon: BarChart3, label: '统计' },
  { id: 'search', icon: Search, label: '搜索' },
  { id: 'settings', icon: Settings, label: '设置', bottom: true },
]
```

功能：

- 点击切换模块
- 折叠/展开
- 使用 `React.memo` 优化按钮重渲染

## 模块视图组件

### ProblemsView

刷题系统主视图。

```tsx
<ProblemsView />
```

子组件：

- **ProblemList** — 题目列表，支持筛选和搜索
- **ProblemDetail** — 题目详情，包含描述、示例、代码编辑器
- **AISidebar** — AI 辅助面板，可获取提示和分析

---

### EditorView

代码编辑器视图。

```tsx
<EditorView />
```

子组件：

- **EditorTabs** — 标签页管理
- **MonacoEditor** — Monaco 编辑器实例
- **Console** — 输出控制台
- **TerminalPanel** — 终端面板

功能：

- 多标签页编辑
- 代码运行（Python、C、C++、C#、SQL）
- 控制台输出
- 终端集成

---

### ChatView

AI 对话视图。

```tsx
<ChatView />
```

子组件：

- **SessionList** — 会话列表（左侧）
- **MessageBubble** — 消息气泡

功能：

- 多会话管理
- 流式 AI 响应
- 提示词预设
- 记忆系统

---

### MistakesView

错题本视图。

```tsx
<MistakesView />
```

功能：

- 错题列表与筛选
- AI 分析错题原因
- 正确代码对比
- 复习提醒

---

### KnowledgeView

知识库视图。

```tsx
<KnowledgeView />
```

功能：

- 上传文档（txt、md、pdf）
- 文档列表管理
- 关键词搜索
- RAG 检索

---

### SettingsView

设置视图。

```tsx
<SettingsView />
```

功能：

- AI 模型配置 CRUD
- 主题切换
- 编辑器设置

---

### StatsView

统计面板。

```tsx
<StatsView />
```

功能：

- 刷题统计图表
- 正确率趋势
- 语言分布
- 学习时长

---

### GlobalSearchView

全局搜索视图。

```tsx
<GlobalSearchView />
```

功能：

- 跨模块搜索
- 题目、聊天、文档联合检索

## 主题变量

所有组件使用 CSS 变量实现主题化：

```css
/* 背景 */
--theme-bg-app           /* 应用背景 */
--theme-bg-sidebar       /* 侧栏背景 */
--theme-bg-hover         /* 悬停背景 */

/* 文本 */
--theme-text-primary     /* 主文本 */
--theme-text-muted       /* 次要文本 */

/* 强调色 */
--theme-accent           /* 主强调色 */
--theme-accent-contrast  /* 强调色上的文本 */
--theme-glow             /* 发光效果 */

/* 边框 */
--theme-border           /* 边框颜色 */
```

使用方式：

```tsx
<div className="bg-[var(--theme-bg-app)] text-[var(--theme-text-primary)]">
```

---

## See Also

- [状态管理](../concepts/state-management.md) -- 组件如何消费 Zustand Store
- [Zustand Stores](stores.md) -- Store 状态与 Actions
- [工具函数](utils.md) -- 组件使用的工具函数
- [架构文档 - 渲染进程](../architecture.md#renderer-process渲染进程) -- 渲染进程模块结构
- [术语表](../glossary.md) -- ErrorBoundary 等术语
