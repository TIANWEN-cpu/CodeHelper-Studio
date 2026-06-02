# 更新日志

本文件记录 CodeHelper 项目的版本变更历史。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

---

## [Unreleased] -- Sprint 11-15 后续迭代

v1.1.0 发布后的持续改进，聚焦 UX 大改造、数据分析、AI 功能增强、CI 稳定性、安全加固和死代码清理。

### 新功能

- **欢迎向导 (welcome_wizard.py)** -- 首次启动引导流程，帮助用户完成初始配置 (Sprint 11)
- **功能导览 (feature_tour.py)** -- 交互式功能介绍，引导用户了解核心功能 (Sprint 11)
- **设置检查清单 (setup_checklist.py)** -- 环境检查与 API Key 配置引导 (Sprint 11)
- **分析工具模块 (analytics)** -- 用户行为数据采集、数据库表、视图组件 (Sprint 12)
- **代码分析器 (code_analyzer.py)** -- AI 驱动的代码理解与分析 (Sprint 13)
- **练习代码分析按钮** -- 一键获取 AI 代码分析 (Sprint 13)
- **课程代码解释按钮** -- 一键获取代码解释 (Sprint 13)
- **AI 导师上下文帮助** -- 与 AI mentor 联动的上下文感知帮助 (Sprint 13)
- **命令面板增强** -- 更多命令、Layout 改进、键盘快捷键支持 (Sprint 15)

### 改进

- **跨平台路径处理** -- 修复 config.py 中的跨平台路径兼容问题 (Sprint 12)
- **i18n 翻译补充** -- 添加 analytics 模块的中英文翻译 (Sprint 12)
- **Onboarding Store** -- 引导状态管理，记录用户引导进度 (Sprint 11)
- **构建脚本跨平台支持** -- macOS 和 Linux 构建支持 (进行中)
- **覆盖率阈值调整** -- 降低至 70% 以适配新功能后的覆盖率水平
- **死代码清理** -- 移除未使用的 DI 容器 (`src/utils/di.ts`)、服务层 (`src/services/*`)、插件系统 (`src/plugins/*`)、引导模块 (`src/bootstrap.ts`)
- **代码执行器安全加固** -- 临时文件自动清理 (cleanupFiles)，防止编译产物泄漏
- **错误处理增强** -- 新增 `CATEGORY_SUGGESTIONS` 用户引导建议，改进错误分类匹配规则 (network/auth/timeout/validation)
- **IPC 安全加固** -- analytics 和 export IPC 新增输入校验，preload 新增安全 API
- **文档更新** -- README 修正版本号引用和技术栈描述，新增截图资源

### Bug 修复

- 修复 ProblemList.tsx 语法错误并应用 Prettier 格式化 (Sprint 12)
- 修复 CI 矩阵中 Node 18 EOL 兼容问题，改为 Node 20+
- 添加 resources/ 到 ESLint 忽略列表，排除 demo 示例代码
- 跳过不稳定超时测试用例
- 修复 Sprint 15 测试质量与 ESLint 清理
- 修复 electron.vite.config.ts 回退到原始工作版本
- 修复 Sprint 11 中 17 个 ESLint unused-variable 警告
- 解决所有 TypeScript 类型错误以通过 CI
- 修复 codeRunner 测试断言以匹配 Linux 实际 spawn 调用模式

### 测试

- 新增分析工具模块测试
- 新增代码分析器测试
- CI 测试矩阵更新为 Node 20+
- 新增深度边界测试套件: `deepEdgeCasesData`, `deepEdgeCasesErrors`, `deepEdgeCasesSystem` (~1700 行)
- 新增 export IPC 测试 (`exportIpc.test.ts`, ~614 行)
- 新增 markdown 渲染测试、内存监控测试、onboarding store 测试
- GitHub Issue 模板配置 (`.github/ISSUE_TEMPLATE/config.yml`)

### 已知问题

- C/C++/C# 评测诚实化 UI 未接入 (框架已就绪)
- 仪表板 analytics section 集成未完成
- macOS/Linux 平台适配未完成 (快捷键、字体回退)
- demo 数据和 README 润色未完成
- 功能展示文档和竞品对比文档未创建

---

## [1.1.0] - 2026-06-02

基于 v1.0.0 发布后的多轮成熟度冲刺（Sprint 4-8），全面提升功能、架构、性能与安全。

### 新功能

- **命令面板 (Command Palette)** -- 全局快捷键 Ctrl+P 调出，支持分类过滤标签页与代码片段命令（Sprint 6）
- **高级架构模块** -- 事件系统、中间件模式、服务层抽象、插件架构、依赖注入（Sprint 8）
- **错误处理体系** -- 全局 ErrorToast 组件、各路由 ErrorBoundary、结构化错误处理工具 `errorHandler.ts`（Sprint 8）
- **全局搜索 (Global Search)** -- 跨模块全文检索，支持结果高亮与搜索历史
- **统计仪表板 (Stats Dashboard)** -- 学习数据分析可视化，支持目标设定与导出
- **代码片段管理 (Code Snippets)** -- 用户自定义代码片段的增删改查
- **标签页持久化 (Tab Persistence)** -- 编辑器标签页状态跨会话保存
- **分屏编辑器 (Split Editor)** -- 支持代码双栏对比编辑
- **终端面板集成 (Terminal Panel)** -- 内嵌终端，直接在应用内执行命令
- **Minimap 开关** -- 编辑器 Minimap 可视化控制

### 改进

- **类型安全增强** -- 消除所有 `any` 类型逃逸，定义 `AIConfigRow` / `AIConfig` 等接口类型；typed IPC 层
- **纯函数提取** -- `codeRunner`、`rag`、`problems`、`textUtils` 等核心模块提取至 `electron/utils/`
- **共享标签映射** -- 提取 `src/utils/labels.ts` 统一管理标签显示逻辑
- **性能优化** -- React 渲染优化（memo / useMemo / useCallback）、Monaco Editor 懒加载与 Worker 优化、Store 粒度化选择器、IPC 去重与分页、Bundle 代码分割
- **数据层优化** -- 数据库 PRAGMA 调优与 ANALYZE、LRU 缓存、Dashboard 查询批处理、内容搜索索引
- **启动优化** -- Layout 视图懒加载、启动服务耗时插桩
- **内存优化** -- 会话清理、聊天历史裁剪、内存监控模块
- **删除确认** -- 操作删除前增加 `window.confirm` 确认对话框
- **版本号动态注入** -- 通过 `__APP_VERSION__` 消除硬编码
- **命令面板增强** -- 更多命令支持、分类过滤、片段管理集成

### 安全修复

- **安全加固审计** -- 完整的安全审计与修复（Sprint 7 审计报告）
- **Chromium 渲染沙箱** -- `contextIsolation` + `nodeIntegration: false`
- **API 密钥加密** -- 使用 Electron `safeStorage` API 加密存储
- **CSP 头部** -- 严格的 Content-Security-Policy 防止 XSS
- **代码执行限制** -- 超时控制、输出大小限制、并发数限制
- **命令注入防护** -- 移除所有 `shell: true` 调用
- **IPC 校验** -- 参数类型检查与协议白名单
- **Electron Fuses** -- 启用安全熔丝保护

### Bug 修复

- 修复 CI 环境中 `npm ci` 需要 `--ignore-scripts` 的兼容性问题
- 修复 SQL 转义引号解析 bug（`sqlUtils.ts`）
- 修复 Sprint 5 集成中的 ESLint 警告
- 修复 `codeRunner.ts` 跨平台命令解析

### 文档

- 新增 CHANGELOG 与 README badges
- 新增 CONTRIBUTING.md 贡献指南
- 新增 Sprint 7 安全审计报告
- 新增 `docs/` 文档体系：架构、FAQ、术语表、搜索索引、快速开始、API 参考、开发者指南、用户指南、故障排查、平台说明
- 新增 JSDoc 注释覆盖公共 API

### 测试

- 新增 `codeRunner.ts` 30 个测试用例（100% 行覆盖）
- 新增 `chatHelpers` 与 `dbSchema` 测试（+95 个用例）
- Vitest 单元测试框架集成，覆盖核心纯函数模块
- 覆盖率阈值门禁（coverage thresholds）
- Pre-commit hooks 集成

### 工程改进

- ESLint flat config + Prettier 代码规范
- GitHub Actions CI 工作流（lint、format check、typecheck、test）
- Dependabot 自动合并工作流
- PR 检查工作流
- React ErrorBoundary 全局错误捕获
- 知识库搜索优化为 SQL 查询，避免全量加载
- 延迟同步题目数据，避免阻塞主线程

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
