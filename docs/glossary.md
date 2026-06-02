# 术语表 (Glossary)

CodeHelper 项目中使用的技术术语和专有名词解释。

---

## A

**ADR (Architecture Decision Record)**
架构决策记录。用于记录项目中重要技术选型的背景、方案和结果。参见 [docs/adr/](adr/) 目录。

**AI 配置 (AI Config)**
在 CodeHelper 中存储的 AI 服务连接参数，包括 API Key、Base URL 和模型名称。API Key 使用 Electron `safeStorage` 加密存储。参见 [API 参考 - 设置与配置](api.md#设置与配置)。

---

## B

**better-sqlite3**
Node.js 的 SQLite 数据库绑定库，提供同步 API，CodeHelper 用作本地数据持久化方案。参见 [ADR-003: 选择 better-sqlite3](adr/003-sqlite-choice.md) 和 [数据库 Schema 参考](reference/database-schema.md)。

**Bundle**
Vite 构建工具将源代码及其依赖打包生成的产物，用于 Electron 应用加载。参见 [构建与发布](guides/deployment.md)。

---

## C

**Catppuccin Mocha**
CodeHelper 默认采用的深色主题配色方案，源自 Catppuccin 主题体系。主背景色为 `#1e1e2e`，强调色为紫色 `#cba6f7`。

**Chromium**
Electron 内嵌的浏览器引擎，渲染进程运行在 Chromium 沙箱中。参见 [安全模型](concepts/security-model.md)。

**CSP (Content-Security-Policy)**
内容安全策略，通过 HTTP 头部限制页面可执行的脚本、样式等资源来源，防止 XSS 攻击。参见 [安全模型](concepts/security-model.md#内容安全策略csp)。

**contextBridge**
Electron 提供的安全 API，用于在预加载脚本和渲染进程之间安全地暴露功能。参见 [IPC 通信模式](concepts/ipc-patterns.md)。

**contextIsolation**
Electron 安全配置项，确保渲染进程与预加载脚本运行在隔离的 JavaScript 上下文中。

---

## D

**Data Flow (数据流)**
数据从用户操作到持久化存储的完整流转路径。CodeHelper 采用单向数据流模式。参见 [数据流](concepts/data-flow.md)。

---

## E

**Electron**
跨平台桌面应用框架，基于 Chromium 和 Node.js 构建。CodeHelper 选用 Electron 41。参见 [ADR-001: 选择 Electron](adr/001-electron-choice.md)。

**electron-builder**
用于将 Electron 应用打包为各平台安装程序的工具。参见 [构建与发布](guides/deployment.md)。

**electron-vite**
专为 Electron 优化的 Vite 构建工具，分别处理主进程和渲染进程的构建。

**ErrorBoundary**
React 错误边界组件，用于捕获子组件树中的渲染错误并显示降级 UI。

---

## G

**GPT (Generative Pre-trained Transformer)**
OpenAI 开发的大语言模型系列。CodeHelper 支持所有兼容 OpenAI API 格式的服务。

---

## H

**handle (IPC)**
Electron 主进程中注册 IPC 请求处理器的方法 (`ipcMain.handle`)，与渲染进程的 `invoke` 配对使用。

---

## I

**IPC (Inter-Process Communication)**
进程间通信。Electron 中主进程和渲染进程之间的通信机制。CodeHelper 使用 invoke/handle（请求-响应）和 send/on（事件推送）两种模式。参见 [IPC 通信模式](concepts/ipc-patterns.md) 和 [IPC 通道参考](reference/ipc-channels.md)。

**IpcChannelMap**
TypeScript 类型接口，将每个 IPC 通道名称映射到其参数类型和返回值类型，实现类型安全的 IPC 调用。参见 [API 参考 - 类型定义](api.md#类型定义)。

**invoke (IPC)**
渲染进程发起 IPC 请求的方法，通过预加载脚本转发到主进程的 `handle` 处理器。

---

## K

**知识库 (Knowledge Base)**
CodeHelper 的 RAG 检索系统，支持导入 PDF/Markdown/TXT 文档，进行文本分块和关键词检索。参见 [知识库指南](user-guide/knowledge-guide.md)。

---

## L

**LLM (Large Language Model)**
大语言模型，如 GPT-4o、DeepSeek 等。CodeHelper 通过 OpenAI 兼容 API 与 LLM 交互。

**长期记忆 (Long-term Memory)**
CodeHelper 的跨会话记忆系统，允许 AI 在不同对话间记住用户偏好和技术上下文。参见 [AI 对话指南](user-guide/ai-chat-guide.md)。

**Lucide React**
CodeHelper 使用的图标库，提供 SVG 图标组件。

---

## M

**Main Process (主进程)**
Electron 应用的 Node.js 进程，拥有完整的系统访问权限，负责窗口管理、IPC 处理、数据库操作和代码执行。参见 [架构详解](developer-guide/architecture.md)。

**Monaco Editor**
VS Code 的核心编辑器组件，CodeHelper 集成用于提供代码编辑功能。支持语法高亮、智能补全、代码折叠等。参见 [编辑器指南](user-guide/editor-guide.md)。

---

## O

**OpenAI 兼容 API**
遵循 OpenAI Chat Completions API 格式的接口规范。CodeHelper 支持任何兼容此规范的服务，包括 OpenAI、DeepSeek、Ollama 等。参见 [API 参考 - AI 集成](api.md#ai-集成)。

---

## P

**PAT (Programming Ability Test)**
编程能力测试，CodeHelper 题库来源之一。

**Preload Script (预加载脚本)**
运行在独立沙箱上下文中的脚本，作为渲染进程与主进程之间唯一的安全桥梁。负责通道白名单校验和序列化检查。参见 [IPC 通信模式](concepts/ipc-patterns.md)。

**预设提示词 (Prompt Preset)**
预定义的 system prompt 模板，用户可以快速切换 AI 对话的角色和行为。分为内置和自定义两类。

**PRAGMA**
SQLite 的配置指令，CodeHelper 使用 WAL 模式和 PRAGMA 优化数据库性能。

---

## R

**RAG (Retrieval-Augmented Generation)**
检索增强生成。CodeHelper 的知识库系统先检索相关文档片段，再将检索结果作为上下文注入 AI 对话。当前实现使用关键词匹配检索，向量嵌入字段已预留。参见 [知识库指南](user-guide/knowledge-guide.md)。

**Renderer Process (渲染进程)**
Electron 应用的 Chromium 进程，运行 React SPA，负责 UI 渲染和用户交互。无 Node.js 访问权限。参见 [架构详解](developer-guide/architecture.md)。

---

## S

**safeStorage**
Electron 提供的操作系统级加密 API，CodeHelper 用于加密存储 AI 配置中的 API Key。参见 [安全模型](concepts/security-model.md#api-密钥保护)。

**Schema 迁移**
数据库结构变更策略。CodeHelper 使用轻量级的前向迁移方案，在启动时自动检查并添加缺失的列。参见 [数据库 Schema 参考](reference/database-schema.md)。

**SSE (Server-Sent Events)**
服务端推送事件协议，CodeHelper 用于 AI 对话的流式输出。主进程解析 SSE 格式的响应流，逐片段推送到渲染进程。参见 [API 参考 - 流式响应处理](api.md#流式响应处理)。

**Store**
Zustand 状态管理单元。CodeHelper 使用多个 Store 管理不同模块的状态。参见 [状态管理](concepts/state-management.md) 和 [Zustand Stores 参考](reference/stores.md)。

---

## T

**TailwindCSS**
原子化 CSS 框架，CodeHelper 使用 TailwindCSS 4 实现样式方案。

**typedInvoke / typedOn**
CodeHelper 封装的类型安全 IPC 调用函数，基于 `IpcChannelMap` 提供完整的 TypeScript 类型推导。参见 [API 参考 - 类型安全机制](api.md#类型安全机制)。

**TypeScript**
JavaScript 的超集，添加了静态类型系统。CodeHelper 使用 TypeScript 6 开发。

---

## V

**Vite**
下一代前端构建工具，CodeHelper 使用 Vite 8 + electron-vite 进行开发和构建。

**Vitest**
Vite 原生的测试框架，CodeHelper 使用 Vitest 进行单元测试。参见 [测试指南](guides/testing.md)。

---

## W

**WAL (Write-Ahead Logging)**
SQLite 的日志模式，允许并发读写，提升数据库性能。CodeHelper 的 SQLite 数据库默认启用 WAL 模式。

**webContents**
Electron BrowserWindow 的核心属性，用于与渲染进程通信（`webContents.send`）和控制页面行为。

---

## Z

**Zustand**
轻量级 React 状态管理库。CodeHelper 使用 Zustand 5 管理应用状态。参见 [ADR-002: 选择 Zustand](adr/002-zustand-over-redux.md) 和 [状态管理](concepts/state-management.md)。
