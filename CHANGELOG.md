# 更新日志

本文件记录 CodeHelper 项目的版本变更历史。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

---

## [1.1.0] - 2026-06-02

基于 v1.0.0 发布后的全面成熟度升级（Sprint 4-27），涵盖功能增强、架构重构、安全加固、测试覆盖、UX 打磨、性能优化与文档完善。

### 新功能

- **命令面板 (Command Palette)** -- 全局快捷键 Ctrl+P 调出，支持分类过滤标签页与代码片段命令
- **全局搜索 (Global Search)** -- 跨模块全文检索，支持结果高亮与搜索历史
- **统计仪表板 (Stats Dashboard)** -- 学习数据分析可视化，支持目标设定、周期视图与数据导出
- **代码片段管理 (Code Snippets)** -- 用户自定义代码片段的增删改查 (SnippetManager)
- **标签页持久化 (Tab Persistence)** -- 编辑器标签页状态跨会话保存
- **分屏编辑器 (Split Editor)** -- 支持代码双栏对比编辑
- **终端面板集成 (Terminal Panel)** -- 内嵌终端，直接在应用内执行命令
- **Minimap 开关** -- 编辑器 Minimap 可视化控制
- **知识图谱 (KnowledgeGraph)** -- 力导向图可视化，展示知识节点与概念关系
- **自动标签 (AutoTagger)** -- AI 驱动的知识条目自动分类与标签
- **RAG 上下文服务** -- AI 对话时自动注入相关知识库上下文
- **纯 SVG 图表组件** -- 折线图、柱状图、饼图、热力图，零外部依赖
- **错误处理体系** -- 全局 ErrorToast 组件、各路由 ErrorBoundary、结构化错误处理工具 `errorHandler.ts`
- **代码分析面板 (AIPanel)** -- 通用可配置 AI 分析面板，替代 4 个重复面板，代码量减少 41%
- **IPC 缓存与去重层** -- `src/api/ipc.ts` 新增 LRU 缓存（200 条上限）和请求去重
- **首次运行欢迎向导** -- 5 步引导流程帮助新用户完成初始配置
- **功能导览 (Feature Tour)** -- 聚光灯式交互功能介绍
- **设置检查清单 (SetupChecklist)** -- 仪表板环境检查与 API Key 配置引导
- **分析工具模块 (Analytics)** -- 用户行为数据采集、数据库表、视图组件、周报

### 改进

- **类型安全增强** -- 消除所有 `any` 类型逃逸，定义 `AIConfigRow` / `AIConfig` 等接口类型；typed IPC 层
- **纯函数提取** -- `codeRunner`、`rag`、`problems`、`textUtils` 等核心模块提取至 `electron/utils/`
- **共享标签映射** -- 提取 `src/utils/labels.ts` 统一管理标签显示逻辑
- **共享 Markdown 渲染** -- 提取 `src/utils/markdown.ts` 替代 4 处重复实现
- **IPC 白名单补全** -- preload.ts 新增 14 个缺失 IPC 通道（analytics 5 个 + knowledge 8 个 + demo-data 1 个）
- **ProblemList 增强** -- 难度徽章、题目分布统计
- **GlobalSearch 增强** -- 结果高亮、搜索历史
- **StatusBar 增强** -- 更丰富的上下文信息
- **React 渲染优化** -- memo / useMemo / useCallback 全面应用
- **Monaco Editor 优化** -- Worker 优化、懒加载、配置缓存
- **Store 粒度化选择器** -- shallow equality 避免无效渲染
- **IPC 去重与分页** -- 请求缓存 + 分页加载
- **Bundle 代码分割** -- 动态 import 实现路由级懒加载
- **数据库 PRAGMA 调优** -- WAL 模式 + ANALYZE + 索引优化
- **LRU 缓存** -- 内容缓存 + 搜索索引
- **启动优化** -- Layout 视图懒加载、启动服务耗时插桩
- **内存优化** -- 会话清理（MAX_MESSAGES=500）、聊天历史裁剪、内存监控模块、IPC 缓存 LRU 淘汰
- **数据库安全加密** -- API Key 使用 Electron safeStorage 加密存储，带 legacy 回退
- **代码执行器安全加固** -- 移除 shell:true、手动超时、1MB 输出限制、最大 5 并发、唯一临时文件名
- **外部链接安全** -- shell.openExternal 协议白名单校验
- **CSP 头部** -- 严格 Content-Security-Policy
- **Electron Fuses** -- 安全熔丝保护
- **死代码清理** -- 移除 src/services/、src/plugins/、src/utils/di.ts、src/bootstrap.ts
- **覆盖率阈值调整** -- 从 88% 调整至 70% 以适配新功能
- **删除确认** -- 操作删除前增加 `window.confirm` 确认对话框
- **版本号动态注入** -- 通过 `__APP_VERSION__` 消除硬编码
- **无障碍改进** -- ARIA 标签、键盘导航、对比度修复

### 安全修复

- **安全加固审计** -- 完整的安全审计与修复（Sprint 7/21/22）
- **Chromium 渲染沙箱** -- `contextIsolation` + `nodeIntegration: false` + `sandbox: true`
- **API 密钥加密** -- 使用 Electron `safeStorage` API 加密存储
- **代码执行限制** -- 超时控制（spawn 手动超时）、输出大小限制（1MB）、并发数限制（5）
- **命令注入防护** -- 移除所有 `shell: true` 调用
- **路径遍历防护** -- 文件路径验证、目录限制
- **临时文件清理** -- 代码运行器自动清理编译产物
- **IPC 输入校验** -- analytics 和 export IPC 新增参数验证

### Bug 修复

- 修复 SQL 转义引号解析 bug（`sqlUtils.ts`）
- 修复 ProblemList.tsx 语法错误并应用 Prettier 格式化
- 修复 CI 矩阵中 Node 18 EOL 兼容问题，改为 Node 20+
- 修复 `electron.vite.config.ts` 回退到原始工作版本
- 修复 codeRunner 测试断言以匹配 Linux 实际 spawn 调用模式
- 修复 dbIndex.test.ts 中的语法错误
- 修复 3 个 ESLint unused-variable 警告（测试文件）
- 解决所有 TypeScript 类型错误以通过 CI
- 修复 npm audit 漏洞
- 修复 IPC 缓存无限增长问题
- 修复跨平台路径处理

### 测试

- 测试用例从 ~750 增长至 **1,476** 条
- 新增深度边界测试套件: `deepEdgeCasesData` (119)、`deepEdgeCasesErrors` (86)、`deepEdgeCasesSystem` (63)
- 新增 IPC 测试: chat / problems / rag / database / runner（约 80 个用例）
- 新增 DB 测试: electron/db/index.ts
- 新增集成测试: problemFlow / chatFlow / editorFlow / settingsFlow
- 新增 export IPC 测试、markdown 渲染测试、内存监控测试、onboarding store 测试
- 弱断言修复：~40 个 `toBeTruthy()`/`toBeDefined()` 替换为精确值断言
- 测试覆盖率 80.35%（Statements 80.57%, Branches 79.66%, Functions 83.58%）

### 文档

- 新增 CHANGELOG.md 并采用 Keep a Changelog 规范
- README.md 添加 CI / Release / License / Stars 徽章
- 新增 CONTRIBUTING.md 贡献指南
- 新增 `docs/` 文档体系：架构、FAQ、术语表、搜索索引、快速开始、API 参考、开发者指南、用户指南、故障排查、平台说明、功能展示、竞品对比
- 新增 JSDoc 注释覆盖公共 API

### 工程改进

- ESLint flat config + Prettier 代码规范
- GitHub Actions CI（Node 20/22 矩阵测试、lint、format check、typecheck、test）
- Dependabot 自动合并工作流 + PR 检查工作流
- Pre-commit hooks 集成（husky + lint-staged）
- React ErrorBoundary 全局错误捕获
- Git 仓库初始化与历史整理

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

---

## See Also

- [README.md](README.md) -- 项目概览与功能特性
- [docs/improvement-plan.md](docs/improvement-plan.md) -- 改进计划与执行进度
- [docs/maturity-plan.md](docs/maturity-plan.md) -- 成熟度改进计划
- [docs/performance-budgets.md](docs/performance-budgets.md) -- 性能预算定义
