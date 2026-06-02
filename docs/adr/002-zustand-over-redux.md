# ADR-002: 选择 Zustand 而非 Redux

## 状态

已采纳

## 背景

CodeHelper 需要一个客户端状态管理方案来管理应用的全局状态（当前模块、主题、对话、题目等）。

### 候选方案

| 方案              | 优势                                 | 劣势                     |
| ----------------- | ------------------------------------ | ------------------------ |
| **Zustand**       | API 简洁、极低样板代码、原生 TS 支持 | 生态比 Redux 小          |
| **Redux Toolkit** | 生态丰富、DevTools 强大、社区成熟    | 样板代码较多、学习曲线   |
| **Jotai**         | 原子化状态、极简                     | 不适合复杂的状态关系     |
| **React Context** | 内置、无依赖                         | 性能问题、不适合频繁更新 |
| **MobX**          | 响应式、自动追踪                     | 魔法较多、调试困难       |

## 决策

选择 **Zustand** 作为状态管理库。

### 理由

1. **极低样板代码**：Zustand 的 Store 创建只需几行代码，无需 Action Creator、Reducer、Dispatch 等概念。

   ```typescript
   // Zustand：5 行搞定
   const useStore = create<State>((set) => ({
     count: 0,
     increment: () => set((s) => ({ count: s.count + 1 })),
   }))
   ```

2. **原生 TypeScript 支持**：通过 `create<State>()` 泛型即可获得完整的类型推断，无需额外的类型定义。

3. **无需 Provider**：Zustand Store 是全局的，不需要在组件树顶层包裹 `<Provider>`，减少了组件层级。

4. **选择器优化**：内置选择器机制，组件只在选中的状态变化时重渲染。

   ```typescript
   const count = useStore((s) => s.count) // 仅在 count 变化时重渲染
   ```

5. **异步操作友好**：Store 的 Action 可以直接是 async 函数，无需中间件。

   ```typescript
   const useStore = create<State>((set) => ({
     data: null,
     loadData: async () => {
       const data = await fetch('/api/data')
       set({ data })
     },
   }))
   ```

6. **小而精**：Zustand 压缩后仅约 1KB，对包体大小几乎无影响。

7. **与 React 并发模式兼容**：支持 React 18+ 的并发特性。

### 权衡

- **DevTools**：Zustand 的 DevTools 支持不如 Redux DevTools 强大，但有 `zustand/middleware` 提供的 devtools 中间件
- **社区规模**：相比 Redux 的庞大社区，Zustand 的社区较小，但增长迅速
- **复杂异步流**：对于非常复杂的异步流程，Redux Toolkit 的 `createAsyncThunk` 可能更结构化

## 后果

- 每个功能域创建独立的 Store（appStore、chatStore、editorStore、problemStore、settingsStore）
- 使用选择器函数确保组件性能
- Store 中的异步操作使用 try/catch 统一错误处理
- 不需要学习 Redux 的概念体系（Action、Reducer、Middleware、Selector）

---

## See Also

- [ADR-001: Electron 选型](001-electron-choice.md) -- 桌面框架选型
- [ADR-003: SQLite 选型](003-sqlite-choice.md) -- 数据库方案选型
- [状态管理](../concepts/state-management.md) -- Zustand 使用模式与最佳实践
- [Zustand Stores 参考](../reference/stores.md) -- 各 Store 详细字段
- [数据流](../concepts/data-flow.md) -- Store 在数据流中的位置
- [术语表](../glossary.md) -- Zustand、Store 等术语
