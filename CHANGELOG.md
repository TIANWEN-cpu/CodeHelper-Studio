# 更新日志

本文件记录 CodeHelper 项目的版本变更历史。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

---

## [2.4.2] - 2026-08-02

v2.4.2 聚焦桌面端可靠性、数据安全和交互一致性，覆盖工作区恢复、AI 请求生命周期、代码运行器清理、IPC 防护和发布前验证。

### 新增与改进

- 工作区和草稿恢复覆盖语言切换、光标/滚动位置、多窗口同步、标签拓扑、异常退出以及 renderer-only crash 场景。
- AI IPC 增加 middleware、并发上限、流式 chunk 合并、请求取消和会话切换隔离，网络抖动时保留已有会话列表。
- 代码运行器和 Windows Job Host 使用有界退出等待；Windows 强制终止后及时释放运行容量，避免槽位永久占用。
- 数据库记录实际 schema 指纹，schema 或迁移片段变化时先创建验证型迁移前备份。
- 生产环境隔离测试 hook 和 renderer 路径信任；未知资源包分类继续 fail-closed。
- 统一设计系统的 Button、Card、Dialog、EmptyState、Spinner、Tabs 等组件，替换原生 `window.confirm` 并改善浅色主题可读性。

### 修复

- 修复切换工作区语言可能替换当前代码的问题。
- 修复并发 AI 请求在取消、切换会话或删除会话时污染新会话消息的问题。
- 修复代码运行 utility / Job Host 清理等待无限挂起，以及 Windows 终止后并发计数不归还的问题。
- 修复 Electron E2E teardown 卡死导致测试超时的问题，诊断采集和进程退出现在都有硬上限。

### 工程与依赖

- Electron 升级至 `41.10.3`，并声明 Node.js `^20.19.0 || ^22.13.0 || >=24`。
- 完整 `npm audit --audit-level=high` 为 0；TypeScript、ESLint、Prettier、Vitest、Electron E2E 和生产构建通过。

---

## [2.4.1] - 2026-07-19

v2.4.1 聚焦真实知识库治理和长文阅读体验，并把清理计划、来源分类、链接状态、备份与删除原因固化为可验证的 SQLite 证据。

### 知识库数据

- 清理 78 篇经过自动或人工复核的同源重复、空页、模板、占位、极短分类 stub 和无入链导航 sidebar；清理后保留 2141 篇文档与 10618 个 chunks。
- 依据 7 个 import-batch 唯一文件映射持久化规范分类、展示标题、来源仓库、上游路径、commit、标签、可见性和正文 SHA-256。
- 持久化 38,470 条逐文档链接审计，统一为 `reachable`、`not_found`、`temporary_error`、`restricted`、`malformed`、`unresolved_relative` 和 `unchecked` 七种状态。
- 维护运行与动作表完整记录计划、备份、清理前后数量、删除原因、来源和 before/after 快照；删除文档后仍保留历史证据。

### 阅读体验

- 知识库新增稳定主题/来源筛选、完整正文加载、文档目录、标题定位、阅读进度、来源路径、版本信息和加载失败重试。
- 相对链接可解析到本地语料或可追踪的上游文件；外链展示离线审计状态并提供失败反馈。
- 长文目录使用缓存位置与二分查找，避免滚动时逐标题同步测量；移除会造成目录和进度跳动的布局占位优化。
- Markdown 图片默认改为显式“查看图片”链接，防止阅读不可信文档时自动请求第三方跟踪资源。

### 数据安全

- 新增 Windows 知识库维护 CLI，严格执行 `audit -> dry-run -> backup -> apply -> verify`。
- 新增带显式 `-ConfirmApply` 门禁的 PowerShell 包装脚本，避免多行命令续行、输出编码和原生 stderr 截断错误。
- 人工删除规则绑定文档 ID、文件名、正文 SHA-256 和来源信息；数据库、规则或远程状态漂移后必须重新规划。
- 真实写入要求 CodeHelper/Electron 已关闭、计划未漂移、SQLite 完整备份通过 SHA-256 与 `quick_check` 验证，并在单个 `BEGIN IMMEDIATE` 事务中执行。
- 备份 manifest v2 绑定源数据库身份和计划 SHA，并保持应用对 v1/v2 清单的读取兼容；应用与验证会核对 metadata、链接、FTS、运行记录及每条维护动作快照。

### 工程质量

- 应用 schema 提升到 2；旧库迁移前自动创建验证型备份，仅迁移时执行全量 metadata 回填，常规启动只补缺失行。
- 资源包分类优先使用受控 `manifest.id`，未知分类 fail closed，来源路径保持为包内相对路径。
- 发布版本脚本同步更新 `package.json` 与 `package-lock.json`，避免发布元数据漂移。
- 单元测试、Python SQLite 维护测试、TypeScript、ESLint、Prettier、生产构建和依赖审计通过。

---

## [2.4.0] - 2026-07-17

v2.4.0 是 CodeHelper 的 Beta Candidate 收口版本，重点完成数据可靠性、受控代码执行、混合知识检索、可审计 Agent、数据库保护、安全边界和 Windows 发布门禁。

### 发布说明

- Windows Installer 与 Portable 有意采用未签名发布模式，系统可能显示“未知发布者”或 SmartScreen 提示；Release 提供 `SHA256SUMS.txt` 和不可变资产校验。
- 工作流严格要求所有相关 EXE 的 Authenticode 状态为 `NotSigned`，不会接受未知错误、损坏签名或意外混入的证书。

### 新功能 / 改进

- **持久化与恢复**：工作区、练习草稿和标签拓扑以 SQLite 为权威存储，支持版本迁移、多窗口 revision、冲突副本、异常退出与 Renderer crash 恢复。
- **受控代码执行**：非 SQL 运行迁移到一次性 utility 进程；Windows Job Host 提供 kill-on-close、进程和内存限制；Docker strong-isolation 使用固定 digest、无网络、只读根和非 root。
- **混合知识检索**：新增 FTS/BM25、trigram、本地语义近似、降级召回、来源锚点和检索评测。
- **Agent 工具链**：主进程工具白名单、强隔离逐次审批、取消/失败终态和 SQLite 审计完整落地。
- **数据保护**：设置页可创建带 SHA-256、schema/app 版本和 `quick_check` 的 SQLite 快照；JSON 导入和数据库迁移前自动 fail-closed 备份。
- **能力状态**：统一展示数据库、工具链、Job Host、Docker、知识检索、Agent、AI 配置和 `safeStorage` 的真实运行状态。
- **发布工程**：Windows NSIS/Portable 加入资源、Fuses、安装、启动、重启持久化、卸载、哈希和 updater metadata 验证。

### 安全

- 主窗口 `will-navigate`、`will-redirect` 和新窗口统一 fail-closed，外部 HTTP/HTTPS 仅通过系统浏览器打开。
- Renderer 不再拥有静默指定 JSON 导入导出路径的 IPC 能力，路径只能由原生文件对话框授权。
- BrowserWindow 显式启用 sandbox，并固定 context isolation、webSecurity、webview、实验特性和不安全内容选项。
- CSP 增加显式 `base-uri 'self'` 与 `form-action 'self'`。
- Vite、esbuild 和 form-data advisory 已关闭，生产与完整 `npm audit` 均为 0。

### 开发体验

- `better-sqlite3` 的 Node/Electron ABI 由 `native:node`、`native:electron` 及 npm 生命周期钩子自动探测切换。
- electron-builder 固定到 26.15.3，使用有界 `UserProgramFiles` 复制修复 NSIS per-user 安装器的 `0xC0000005` 崩溃。
- lint、格式、覆盖率、Electron harness、Docker integration 和 Windows package smoke 形成统一验收链。

### 验证

- 单元测试与覆盖率：2518 通过，2 条平台/专用 harness 跳过。
- Electron E2E：24/24。
- Docker isolation：28/28。
- 知识检索：33/33；Agent：23/23。
- TypeScript、ESLint、Prettier、完整依赖审计、Electron 专项 smoke 和 Windows package smoke 全部通过。

---

## [2.3.0] - 2026-07-03

v2.3.0 在 v2.2.1 基础上整合了 34 个提交，重点升级了学习工作台的记忆系统、全局检索与通知体系，并对时间计算、判题与代码运行做了全面的 UTC 一致性与健壮性修复。

### 新功能 / 改进

- **记忆系统升级**：长期记忆支持更丰富的捕获、排序与去重，新增按分类的发送控制、预览能力，以及由 LLM 抽取记忆的后端与配套管理 UI。
- **命令面板 → 全局搜索**：命令面板升级为全局搜索，新增最近访问记录与知识库检索，支持分组表头与可视范围内打开时记录最近访问。
- **全局通知与成就提醒**：新增全局 toast 系统，成就解锁会主动弹出提醒；代码运行、提交和 AI 失败统一以 toast 呈现。
- **间隔复习键盘自评**：复习卡片支持 `1/2/3` 键盘快捷键自评，加速卡片评分。
- **个人页周学习报告**：个人主页接入每周学习报告。
- **AI 桌宠增强**：达到学习里程碑时桌宠庆祝并弹出气泡，闲置时偶尔播放微动画。
- **知识 RAG 接入 AI 对话**：知识库检索结果可直接作为 AI 对话上下文注入。

### 修复

- **时间与时区（UTC 一致性）**：连续学习天数（streak）、周报、首页看板、SM-2 复习日期计算及 `formatDate` 全部改为按 UTC 解析后端时间戳，避免 UTC+8 跨天偏移。
- **RAG**：知识库上传的文档与分块写入改为单事务，保证一致性。
- **判题与运行器**：运行器输出超限或超时时杀掉整棵进程树，避免残留子进程；错题删除时级联清理 `review_schedule`。
- **AI 对话**：修复新请求覆盖前序请求 abort controller 的问题；题库标签 / 赛道筛选正确转义 LIKE 通配符，避免误匹配。
- **导航与深链**：深链 pending 状态在实时投递后清除，防止重复回放；桌宠空闲计时器在路由切换后保留，toast 在重复触发时重新计时。
- **账户与资料**：同步个人页 XP 数据并简化头像设置。
- **学习工作台视觉打磨**。

### 性能

- **RAG 检索**：限制关键词检索候选数量并复用已编译正则，降低大知识库下的搜索开销。
- **活动事件查询**：`getEvents` 改为封顶返回行数，避免一次性流式读取整张表。

### 重构

- 将 AI 对话统一收敛到 `useChatStore`，移除冗余的 `useAIChat`。
- 移除不可达的后端成就 IPC。
- 加固 AI Provider 的 SSRF 校验。

### 持续集成

- 关闭 Dependabot 版本更新，并降低其通知噪音。

---

## [2.2.1] - 2026-06-06

v2.2.1 是一次面向真实桌面使用的体验修复发布，重点解决浅色主题视觉割裂、账户资料不可自定义、学习记录缺少清空入口，以及资源包导入链路缺口。

### 新功能 / 改进

- **浅色主题专属视觉**：首页学习工作台、右侧 workbench、个人主页横幅改为白色 / 浅蓝紫面板，不再在浅色页面中嵌入深色大块。
- **账户资料自定义**：设置页新增账户页签，支持自定义昵称、图片头像 / URL / 文本头像，个人主页和侧栏同步展示。
- **学习记录一键清空**：新增 `learning-records-clear` IPC，支持清空提交、错题、学习进度、成就进度和活动事件，同时保留题库、知识库、AI 配置、账户资料和课堂笔记。
- **AI 桌宠体验整理**：默认桌宠、低动效闲置动画、个人页停靠尺寸和主题套装命名进一步协调；移除容易误导的主题图片入口。
- **资源包导入链路**：新增 import-ready 资源包 IPC 和前端服务封装，为知识文档和题库资源批量导入留出正式入口。

### 修复

- 修复浅色高对比下 `text-white`、透明度文字和主题卡片文字可读性不足的问题。
- 修复个人页 AI 桌宠遮挡活动构成区域的问题。
- 修复浏览器预览与 Electron 真实设置状态不一致时，旧浅色主题组合无法自动迁移的问题。

### 测试

- 新增 `tests/learningRecordsIpc.test.ts` 覆盖学习记录清空 IPC 注册和行为。
- 扩展 `tests/productionFixes.test.ts`，守护浅色主题、账户设置、桌宠和学习记录清空等产品修复。
- 已验证：`npm run typecheck`、`npx vitest run tests/productionFixes.test.ts tests/learningRecordsIpc.test.ts`、`npm run build`。

## [2.2.0] - 2026-06-04

三项目融合产品的"假功能全面真实化"里程碑。经四轮审查，前端不再有任何装饰性空壳，每个按钮 / 开关 / 统计都接通真实后端。可扩展，不简化。

### 新功能 / 改进

- **代码编辑器**：引入 CodeMirror 6 语法高亮引擎，多代码主题实时切换。
- **错题 ↔ 复习闭环**：做错即建 SM-2 间隔复习排程；"还不会 / 有点难 / 已掌握"三档真实自评驱动复习间隔。
- **AI 工作台化**：上下文感知（提问自动带入当前题目 / 练习 / 错题的代码与报错）、对话历史 / 会话人设 / 长期记忆、运行报错一键诊断；错题复盘接通真实 AI（未配置时诚实回退本地规则）。
- **学习数据真实化**：代码运行 / 解题 / 课程完成 / AI 提问行为埋点，首页活跃度热力图、连续天数、经验等级由真实事件推导。
- **运行器**：补齐 Node.js 真实执行，语言下拉对齐后端。
- **设置真实生效**：主题色全色系跟随、浅色 / 深色、紧凑侧边栏、AI / 底部面板、双行标签、日期区域与每周起始日等开关全部接通真实状态。

### 修复

- 复习 key 统一为 `problem_id` 字符串，修复错题与复习排程数字 ↔ 字符串永不匹配。
- `review-due` 关联题库取回标题 / 难度。

---

## [2.1.0] - 2026-06-03

本地迭代版本，聚焦 Electron 启动稳定性、知识库延迟初始化与前端可诊断性。

### 新功能 / 改进

- Electron 启动链路补充关键阶段日志，包括 DB 连接、schema 加载、schema 执行、ensureSchemaColumns 完成。
- RAG / Knowledge DB 改为延迟初始化，避免阻塞主启动流程。
- 读型知识库 IPC 在 DB 未就绪时返回 graceful empty payload。
- 写型知识库 IPC 增加带超时的 DB 获取路径，避免永久卡死。
- database / problems / ai 等 IPC 注册链路增加 first-call 诊断日志。
- renderer 启动流程关键位置补充日志，便于定位首次白屏问题。
- preload、runtimePaths、middleware、CSP、RAG test 路径进一步校验与加固。

### 测试

- 维持 1477 项通过。

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
