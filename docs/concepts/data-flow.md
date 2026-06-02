# 数据流

本文档描述 CodeHelper 中数据从用户操作到持久化的完整流转路径。

## 数据流概览

```
用户操作 → React 组件 → Store Action → IPC 调用
    → preload 校验 → 主进程处理器 → 数据库/外部 API
    → 返回结果 → Store 更新 → React 重渲染 → UI 更新
```

## 场景 1：题目列表加载

```
┌──────────┐    setActiveModule('problems')    ┌──────────┐
│  Sidebar │ ────────────────────────────────→ │ AppStore │
└──────────┘                                   └────┬─────┘
                                                    │
                                             Layout 切换到 ProblemsView
                                                    │
┌──────────────┐  loadProblems(filters)  ┌──────────┴──────┐
│ ProblemsView │ ←────────────────────── │  problemStore   │
└──────────────┘                         └────────┬────────┘
                                                  │
                                    typedInvoke('problems-list', filters)
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │    主进程 problems.ts      │
                                    │  db.prepare('SELECT ...')  │
                                    └─────────────┬─────────────┘
                                                  │
                                    Problem[] ←───┘
                                                  │
                                    set({ problems: Problem[] })
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │   ProblemList 重渲染        │
                                    │   显示筛选后的题目列表       │
                                    └───────────────────────────┘
```

**代码追踪**：

```
1. 用户点击侧栏"刷题"
   → SidebarButton.onClick → appStore.setActiveModule('problems')

2. Layout 检测 activeModule 变化 → 渲染 <ProblemsView />

3. ProblemsView 组件挂载 → useEffect → problemStore.loadProblems()

4. loadProblems() 实现：
   set({ loading: true, loadError: null })
   const problems = await typedInvoke('problems-list', get().filters)
   set({ problems })

5. 主进程处理：
   ipcMain.handle('problems-list', (_event, filters) => {
     let sql = 'SELECT * FROM problems'
     // 根据 filters 动态构建 WHERE 子句
     const rows = db.prepare(sql).all()
     // 解析 JSON 字段（tags, languages, examples 等）
     return rows.map(parseProblemRow)
   })

6. 数据返回 → Store 更新 → ProblemList 组件重渲染
```

## 场景 2：代码提交

```
┌───────────────┐  submit(code, lang)  ┌───────────────┐
│ EditorConsole │ ───────────────────→ │ problemStore  │
└───────────────┘                      └───────┬───────┘
                                               │
                              typedInvoke('problems-submit', {
                                problemId, code, language
                              })
                                               │
                              ┌────────────────┴────────────────┐
                              │     主进程 problems.ts          │
                              │                                 │
                              │ 1. 获取题目 test_cases          │
                              │ 2. 调用 codeRunner 执行代码      │
                              │ 3. 比较输出与期望结果             │
                              │ 4. 保存提交记录到 submissions 表 │
                              │ 5. 更新 mistakes 表（如有错）    │
                              └────────────────┬────────────────┘
                                               │
                              Submission 结果 ←─┘
                                               │
                              set({ submitResult: result })
                                               │
                              ┌────────────────┴────────────────┐
                              │   显示测试结果 (通过/失败)        │
                              │   更新题目列表的 solved 状态      │
                              └─────────────────────────────────┘
```

## 场景 3：AI 流式对话

这是 CodeHelper 中最复杂的数据流，涉及双向通信：

```
渲染进程                                       主进程
   │                                             │
   │  sendMessage(content)                       │
   │  ├─ 构造用户消息 + 助手占位消息               │
   │  ├─ 更新 messages 状态                       │
   │  ├─ typedInvoke('chat-message-save') ───────→│ 保存用户消息到 DB
   │  ├─ typedInvoke('chat-memory-capture') ─────→│ 提取记忆候选
   │  │                                           │
   │  ├─ typedInvoke('ai-chat') ─────────────────→│
   │  │                                           │  获取 AI 配置
   │  │                                           │  注入相关记忆到上下文
   │  │                                           │  fetch() 调用 AI API (stream: true)
   │  │                                           │
   │  │    ←────── 'ai-chat-chunk' { chunk } ─────│  解析 SSE 数据
   │  ├─ appendChunk(payload)                     │
   │  │   → 更新最后一条 assistant 消息内容         │
   │  │                                           │
   │  │    ←────── 'ai-chat-chunk' { chunk } ─────│
   │  ├─ appendChunk(payload)                     │
   │  │   → 增量追加                               │
   │  │                                           │
   │  │   ... (重复多次)                           │
   │  │                                           │
   │  │    ←────── 'ai-chat-done' { content } ────│
   │  ├─ finishStream(payload)                    │
   │  │   → typedInvoke('chat-message-save') ────→│ 保存完整助手回复到 DB
   │  │   → set({ streaming: false })             │
   │  │   → loadSessions() 刷新会话列表 ──────────→│
   │  │                                           │
   │  └─ 完成                                     │
   │                                             │
```

**关键细节**：

1. **Request ID 匹配**：每个请求生成唯一 `reqId`，`appendChunk` 和 `finishStream` 会检查 ID 是否匹配当前请求，防止并发请求导致数据混乱。

2. **乐观更新**：发送消息时立即在 UI 上显示用户消息和空的助手消息，不等待 API 响应。

3. **自动重命名**：如果会话标题是 "新对话"，会用第一条用户消息的前 30 个字符自动重命名。

4. **记忆注入**：主进程会自动从 `memories` 表中检索相关记忆，注入到 AI 上下文中。

## 场景 4：知识库 RAG 检索

```
用户上传文档 → knowledge-upload IPC
    │
    ├─ 弹出文件选择对话框
    ├─ 读取文件内容（支持 txt、md、pdf）
    ├─ 文本分块（chunk）
    ├─ 保存到 knowledge_docs + knowledge_chunks 表
    └─ 返回文件名列表

用户搜索 → knowledge-search IPC
    │
    ├─ 从 knowledge_chunks 表中检索
    ├─ 使用 LIKE 或关键词匹配
    ├─ 返回相关的 chunk 内容
    └─ 展示搜索结果
```

## 场景 5：设置持久化

```
用户修改设置
    │
    ├─ 主题切换:
    │   appStore.setTheme('fjord')
    │   → document.documentElement.dataset.theme = 'fjord'
    │   → typedInvoke('db-set-setting', 'ui-theme', 'fjord')
    │   → INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    │
    ├─ AI 配置保存:
    │   settingsStore.saveConfig(config)
    │   → typedInvoke('db-save-ai-config', config)
    │   → encryptApiKey(config.api_key)  // safeStorage 加密
    │   → INSERT/UPDATE ai_configs SET ...
    │
    └─ 编辑器标签页:
        editorStore.addTab(tab)
        → localStorage.setItem('codehelper-editor-tabs', JSON.stringify(tabs))
        // 注意：标签页使用 localStorage，不使用 SQLite
```

## 持久化策略

| 数据类型       | 存储位置             | 原因                       |
| -------------- | -------------------- | -------------------------- |
| 题目、提交记录 | SQLite               | 结构化查询、关系数据       |
| AI 配置        | SQLite + safeStorage | 需要加密 API Key           |
| 聊天历史       | SQLite               | 需要按会话查询和分页       |
| 知识库文档     | SQLite               | 需要全文检索               |
| 记忆           | SQLite               | 需要分类、搜索、置信度管理 |
| 用户设置       | SQLite (settings 表) | 键值对持久化               |
| 主题           | SQLite (settings 表) | 跨会话持久化               |
| 编辑器标签页   | localStorage         | 仅 UI 状态，不需服务端     |
| 侧栏折叠状态   | 内存（Store）        | 无需持久化                 |

## 错误恢复

当数据流中发生错误时，各层的处理策略：

| 层次     | 错误处理                                                |
| -------- | ------------------------------------------------------- |
| 组件层   | ErrorBoundary 捕获渲染错误，显示错误 UI                 |
| Store 层 | try/catch 捕获，设置 error 状态，UI 显示错误信息        |
| IPC 层   | 主进程抛出的 Error 通过 Promise rejection 传回渲染进程  |
| 数据库层 | SQLite 错误由主进程处理器捕获并转换为用户友好的错误信息 |
| 网络层   | fetch 错误（超时、断网）被捕获并分类（categorizeError） |

---

## See Also

- [系统架构](architecture.md) -- 模块职责与通信架构
- [IPC 通信模式](ipc-patterns.md) -- IPC 调用的类型安全与安全校验
- [安全模型](security-model.md) -- 各层安全措施
- [状态管理](state-management.md) -- Zustand Store 的状态更新与错误处理
- [架构文档 - 数据流](../architecture.md#数据流) -- 简化版数据流概览
- [API 参考](../api.md) -- 通道详细参数与返回值
- [术语表](../glossary.md) -- 技术名词解释
