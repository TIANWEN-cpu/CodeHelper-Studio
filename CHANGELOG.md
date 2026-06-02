# 更新日志

本文件记录 CodeHelper 项目的版本变更历史。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

---

## [1.0.0] - 2026-06-02

CodeHelper 首个正式版本发布。基于 Electron + React + TypeScript 构建的 AI 驱动桌面编程助手。

### 核心功能

- **Monaco 代码编辑器** -- 集成 VSCode 同款编辑引擎，支持语法高亮、智能补全、多标签页管理
- **AI 智能对话** -- 支持 OpenAI 兼容 API，流式输出，Markdown 渲染与代码块高亮，预设提示词系统
- **题库系统** -- 内置 158+ 道题目（力扣、牛客、PAT、CSP、数学建模），支持自动判题与多语言
- **知识库 RAG 检索** -- 支持 PDF / Markdown / TXT 文档导入，自动分块与关键词向量检索
- **错题本** -- 自动记录错误题目，追踪错误次数与类型，AI 分析薄弱知识点，支持一键重做
- **代码运行器** -- 支持 Python、C、C++、C#、Java、JavaScript 六种语言本地执行
- **个性化设置** -- Catppuccin Mocha 主题、AI 模型配置、快捷键自定义

### 安全加固

- 启用 Chromium 渲染进程沙箱（`contextIsolation` + `nodeIntegration: false`）
- 使用 Electron `safeStorage` API 加密存储 API 密钥
- 配置严格的 Content-Security-Policy 头部，防止 XSS 攻击
- 代码执行添加超时控制、输出大小限制、并发数限制
- 移除所有 `shell: true` 调用，防止命令注入
- IPC 参数进行类型检查与协议白名单校验
- 外部链接仅允许 `http:` / `https:` 协议
- 子进程异步 spawn 增加手动超时机制
- 知识库文件上传增加大小限制
- 数据库连接延迟初始化，JSON 解析增加错误处理
- AI 请求支持 AbortController 取销机制

### 工程改进

- 提取纯函数模块（`codeRunner`、`rag`、`problems`、`textUtils`）至 `electron/utils/`
- 消除 `any` 类型逃逸，定义 `AIConfigRow` / `AIConfig` 等接口类型
- 提取共享标签映射函数至 `src/utils/labels.ts`
- 删除操作增加 `window.confirm` 确认对话框
- 版本号通过 `__APP_VERSION__` 动态注入，消除硬编码
- 引入 ESLint flat config + Prettier 代码规范
- 引入 Vitest 单元测试框架，覆盖核心纯函数模块
- 添加 GitHub Actions CI 工作流（lint、format check、typecheck、test）
- React ErrorBoundary 全局错误捕获
- 优化知识库搜索为 SQL 查询，避免全量加载
- 延迟同步题目数据，避免阻塞主线程
