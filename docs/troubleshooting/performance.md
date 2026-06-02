# 性能优化

本文档介绍 CodeHelper 的性能优化策略和诊断方法。

## 性能监控

### 内置 IPC 性能监控

CodeHelper 内置了 IPC 调用性能监控系统（`electron/utils/perfMonitor.ts`）。

**自动日志**：每 5 分钟输出统计摘要到终端。

```
[perf] IPC Call Statistics:
  Channel                  | Calls | Avg (ms) | Slow | Last Called
  -------------------------|-------|----------|------|------------
  problems-list            |    12 |      5.3 |    0 | 14:30:25
  ai-chat                  |     3 |   2341.2 |    3 | 14:28:10
```

- **Slow** 列：超过 1 秒阈值的调用次数
- 通过 `perf-get-ipc-stats` 通道可在渲染进程中查询

### 手动追踪

在需要追踪的代码处添加计时：

```typescript
const start = performance.now()
// ... 执行操作 ...
const duration = performance.now() - start
console.log(`[perf] 操作耗时: ${duration.toFixed(1)}ms`)
```

## 已实施的优化

### 1. 数据库优化

**WAL 模式**：

```typescript
// electron/db/index.ts
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
```

WAL 模式允许并发读取，不会因写入操作阻塞查询。

**预编译语句**：

```typescript
// 好：预编译后复用
const stmt = db.prepare('SELECT * FROM problems WHERE difficulty = ?')
const easy = stmt.all('easy')

// 不好：每次都编译
const easy = db.prepare('SELECT * FROM problems WHERE difficulty = ?').all('easy')
```

**索引优化**：

```sql
-- 高频查询字段建索引
CREATE INDEX idx_problems_difficulty ON problems(difficulty);
CREATE INDEX idx_submissions_problem_status ON submissions(problem_id, status);
CREATE INDEX idx_chat_history_session ON chat_history(session_id, created_at, id);
CREATE INDEX idx_memories_enabled_pinned ON memories(enabled, pinned DESC, updated_at DESC);
```

**事务优化**：

```typescript
// 批量操作使用事务
const saveAll = db.transaction((items: Item[]) => {
  const stmt = db.prepare('INSERT INTO ... VALUES (?)')
  for (const item of items) {
    stmt.run(item.value)
  }
})
saveAll(items)
```

### 2. React 渲染优化

**React.memo**：

```typescript
// 避免父组件重渲染导致子组件无意义重渲染
const SidebarButton = memo(function SidebarButton({ id, icon, isActive, onClick }) {
  return <button onClick={() => onClick(id)}>...</button>
})
```

**useCallback**：

```typescript
// 稳定回调引用，避免 memo 子组件失效
const handleClick = useCallback(
  (id: ModuleId) => {
    setActiveModule(id)
  },
  [setActiveModule],
)
```

**useMemo**：

```typescript
// 缓存计算结果
const topItems = useMemo(() => items.filter((i) => !i.bottom), [])
```

**选择器粒度**：

```typescript
// 好：精确选择
const activeModule = useAppStore((s) => s.activeModule)
const theme = useAppStore((s) => s.theme)

// 不好：选择整个 store
const store = useAppStore()
```

### 3. Monaco Editor 优化

- 编辑器按需加载，不在首屏渲染
- 标签页状态持久化到 localStorage，避免重复初始化
- 编辑器配置缓存（主题、字体等不变配置）

### 4. AI 流式响应优化

**请求 ID 匹配**：防止并发请求的数据混乱。

```typescript
if (payload.requestId !== get().currentRequestId) return
```

**请求取消**：新请求自动取消同 ID 的旧请求。

```typescript
const existing = activeRequests.get(requestId)
if (existing) existing.abort()
```

### 5. 代码执行优化

**并发限制**：

```typescript
const MAX_CONCURRENT = 5
if (activeProcesses >= MAX_CONCURRENT) {
  return { stderr: '并发执行数量已达上限' }
}
```

**超时控制**：

```typescript
const timer = setTimeout(() => {
  proc.kill()
}, 10000)
```

**输出限制**：

```typescript
const MAX_OUTPUT_SIZE = 1024 * 1024 // 1MB
if (stdout.length > MAX_OUTPUT_SIZE) {
  proc.kill()
}
```

### 6. 记忆检索优化

记忆检索使用内存过滤（非 SQL LIKE），通过关键词匹配算法：

- 置顶记忆基础分 +50
- 关键词匹配按长度加分
- 完整匹配 +20

取 Top 6 条注入 AI 上下文。

## 性能诊断方法

### 渲染进程

**React Profiler**：

1. 安装 React DevTools
2. 打开 Profiler 面板
3. 录制操作
4. 查看组件渲染耗时和重渲染原因

**Performance 面板**：

1. 打开 DevTools → Performance
2. 点击录制
3. 执行操作
4. 停止录制
5. 分析火焰图，找出长任务

**Lighthouse**：
虽然 Electron 应用不完全适用 Lighthouse，但可以参考其性能指标。

### 主进程

**CPU Profiling**：

```bash
# 使用 Node.js 内置 profiler
node --prof node_modules/.bin/electron-vite dev

# 分析输出
node --prof-process isolate-*.log > processed.txt
```

**内存监控**：

```typescript
// 在主进程中定期输出内存使用
setInterval(() => {
  const mem = process.memoryUsage()
  console.log(
    `[mem] RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB, ` +
      `Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`,
  )
}, 30000)
```

### 数据库

**查询性能**：

```sql
-- 启用查询计划
EXPLAIN QUERY PLAN SELECT * FROM problems WHERE difficulty = 'easy'
-- 应该显示 "USING INDEX idx_problems_difficulty"

-- 查看数据库统计
PRAGMA stats;
```

**慢查询排查**：

```typescript
// 在数据库操作前后计时
const start = performance.now()
const result = db.prepare(sql).all()
const duration = performance.now() - start
if (duration > 100) {
  console.warn(`[db] Slow query (${duration.toFixed(1)}ms): ${sql.slice(0, 100)}`)
}
```

## 优化检查清单

- [ ] 数据库启用了 WAL 模式
- [ ] 高频查询字段有索引
- [ ] 批量操作使用事务
- [ ] 预编译 SQL 语句复用
- [ ] React 组件使用 `memo` 优化
- [ ] 回调函数使用 `useCallback`
- [ ] 计算结果使用 `useMemo`
- [ ] Zustand 选择器粒度足够细
- [ ] Monaco Editor 配置已缓存
- [ ] AI 请求有取消机制
- [ ] 代码执行有并发和超时限制
- [ ] 无内存泄漏（事件监听已清理）

---

## See Also

- [性能预算](../performance-budgets.md) -- 关键操作性能目标
- [故障排除](../troubleshooting.md) -- 综合故障排除指南
- [常见问题](common-issues.md) -- 日常开发常见问题
- [构建问题排查](build-issues.md) -- 构建与打包故障
- [架构文档](../architecture.md) -- 性能考量与优化策略
- [术语表](../glossary.md) -- 技术名词解释
