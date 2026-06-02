# ADR-001: 选择 Electron 作为桌面框架

## 状态

已采纳

## 背景

CodeHelper 是一个集成代码编辑器、AI 对话、知识库和刷题系统的桌面编程辅助工具。需要选择一个合适的桌面应用框架来构建。

### 候选方案

| 方案            | 优势                         | 劣势                          |
| --------------- | ---------------------------- | ----------------------------- |
| **Electron**    | Web 技术栈、生态丰富、跨平台 | 包体较大、内存占用较高        |
| **Tauri**       | 体积小、性能好、Rust 后端    | 生态较新、学习曲线陡          |
| **PyQt/PySide** | Python 原生、桌面控件丰富    | UI 现代化困难、跨平台一致性差 |
| **原生开发**    | 性能最优                     | 开发成本高、需维护多套代码    |

## 决策

选择 **Electron** 作为桌面框架。

### 理由

1. **Monaco Editor 集成**：CodeHelper 的核心功能是代码编辑器。Monaco Editor（VS Code 的编辑器组件）天然运行在浏览器环境中，Electron 可以零成本集成。

2. **AI 对话流式响应**：AI 对话需要 SSE（Server-Sent Events）流式通信。浏览器原生支持 Fetch API 的流式读取，与 Electron 完美兼容。

3. **React 生态**：项目使用 React 作为 UI 框架。React 的组件化开发模式、丰富的第三方库（如 react-markdown、react-syntax-highlighter）在 Electron 中完全可用。

4. **跨平台一致性**：一套代码即可在 Windows、macOS、Linux 上运行，UI 表现完全一致。

5. **开发效率**：Web 技术栈（HTML/CSS/JS）的开发效率远高于原生桌面开发。热更新（HMR）支持使得迭代速度极快。

6. **SQLite 集成**：通过 better-sqlite3 原生模块，可以在主进程中直接、同步地访问 SQLite 数据库，无需异步桥接。

7. **安全模型成熟**：Electron 提供 `contextIsolation`、`nodeIntegration`、CSP 等完善的安全机制。

### 权衡

- **包体大小**：Electron 应用基础包约 150-200MB，对于工具类应用偏大
- **内存占用**：Chromium 内核的内存占用较高，通常 200-400MB
- **启动速度**：相比原生应用较慢，约 2-5 秒

这些权衡在编程工具场景下可以接受：用户通常长时间运行，而非频繁启停。

## 后果

- 需要维护主进程（Node.js）和渲染进程（浏览器）两套运行环境
- 需要通过 IPC 机制进行进程间通信
- 需要关注 Electron 安全最佳实践
- 可以充分利用 Web 生态的丰富组件和工具

---

## See Also

- [ADR-002: Zustand 选型](002-zustand-over-redux.md) -- 状态管理方案选型
- [ADR-003: SQLite 选型](003-sqlite-choice.md) -- 数据库方案选型
- [系统架构](../concepts/architecture.md) -- Electron 架构的实现细节
- [安全模型](../concepts/security-model.md) -- Electron 安全策略
- [构建与发布](../guides/deployment.md) -- electron-builder 打包配置
- [依赖审计报告](../dependency-audit.md) -- Electron 版本与依赖分析
- [术语表](../glossary.md) -- Electron、Chromium 等术语
