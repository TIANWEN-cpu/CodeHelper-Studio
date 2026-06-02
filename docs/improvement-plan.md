# CodeHelper 改进计划

> 基于 2026-06-01 深度审计结果制定，涵盖开发体验、架构、UX、性能、发布构建和文档六大领域。

> **执行进度（2026-06-02）**：已完成 3.3、3.4、3.5、4.1、4.2、4.8、4.9、4.10（共 8 项低风险高置信度改进）。详见各节标记。

---

## 一、概述

CodeHelper 是一个基于 Electron + React + SQLite 的编程练习辅助工具，核心功能包括题目管理、代码编辑运行、AI 对话和知识库检索。当前版本已具备良好的安全基础（IPC 白名单、safeStorage 加密、CSP 配置）和合理的数据层设计（WAL 模式、外键约束），但在工程化、代码质量和用户体验方面存在明显短板。

本计划将审计发现的 **35 项问题** 按优先级分批推进，目标是在 **4 个迭代周期** 内完成所有 P0 和 P1 项，P2 项作为后续持续改进。

---

## 二、优先级总览

| 优先级 | 数量 | 含义 | 预计覆盖周期 |
|--------|------|------|-------------|
| P0     | 11 项 | 必须立即修复，影响安全/质量/基本可用性 | 第 1-2 周 |
| P1     | 14 项 | 应尽快解决，影响开发效率/用户体验/构建正确性 | 第 2-4 周 |
| P2     | 10 项 | 改善型，可在后续迭代中逐步推进 | 第 4 周及以后 |

---

## 三、P0 改进项（立即执行）

### 3.1 引入 Lint / Format / Test 工具链

- **目标**: 建立代码质量基线，所有新提交必须通过 lint 检查
- **涉及文件**: `D:\codehelper\package.json`
- **执行步骤**:
  1. 安装 `eslint`、`@typescript-eslint/parser`、`@typescript-eslint/eslint-plugin`、`eslint-plugin-react`、`eslint-plugin-react-hooks`
  2. 安装 `prettier` 及 `eslint-config-prettier`
  3. 安装 `vitest`、`@testing-library/react`（如需组件测试）
  4. 在 `package.json` 的 `scripts` 中添加 `lint`、`format`、`test` 命令
  5. 创建 `.eslintrc.cjs` 和 `.prettierrc` 配置文件
- **风险**: 初次运行 lint 可能暴露大量已有问题，建议先以 `warn` 级别引入，后续逐步收紧为 `error`
- **收益**: 统一代码风格，减少低级 bug，为后续重构提供安全网

### 3.2 补充单元测试（零测试覆盖）

- **目标**: 核心工具函数和 IPC 逻辑达到基本测试覆盖
- **涉及文件**:
  - `D:\codehelper\electron\utils\codeRunner.ts` — `splitSqlStatements`、`normalizeSql`
  - `D:\codehelper\electron\ipc\chat.ts` — `extractMemoryCandidates`、`getRelevantMemories`、`buildSearchTerms`
- **执行步骤**:
  1. 在项目根目录创建 `vitest.config.ts`（或 `vitest.config.mts`）
  2. 在 `electron/utils/__tests__/` 下为 `codeRunner.ts` 编写单元测试
  3. 在 `electron/ipc/__tests__/` 下为 `chat.ts` 编写单元测试
  4. 在 CI 中配置 `vitest run` 步骤
- **风险**: 部分函数依赖 `better-sqlite3`，测试时需 mock 数据库层
- **收益**: 防止回归 bug，为后续重构提供信心

### 3.3 消除 database.ts 中的 any 类型

- **目标**: 类型安全覆盖数据库读取层
- **涉及文件**: `D:\codehelper\electron\ipc\database.ts`（第 21、47 行）
- **执行步骤**:
  1. 定义 `AIConfigRow` 接口，包含 `id`、`provider`、`apiKeyEncrypted`、`baseUrl`、`model` 等字段
  2. 将 `decryptConfigRow(row: any): any` 改为 `decryptConfigRow(row: AIConfigRow): AIConfig`
  3. 将 `prepare(...).all() as any[]` 改为 `prepare(...).all() as AIConfigRow[]`
- **风险**: 低，纯类型层面改动不影响运行时行为
- **收益**: 消除类型逃逸，IDE 自动补全和重构更安全

### 3.4 提取标签映射函数消除重复

- **目标**: 消除 ProblemList 和 ProblemDetail 之间的代码重复
- **涉及文件**:
  - `D:\codehelper\src\modules\problems\ProblemList.tsx`（第 295-363 行）
  - `D:\codehelper\src\modules\problems\ProblemDetail.tsx`（第 328-391 行）
- **执行步骤**:
  1. 创建 `D:\codehelper\src\utils\labels.ts`
  2. 将 `parseJsonArray`、`trackLabel`、`platformLabel`、`modeLabel`、`sourceLabel`、`examStyleLabel` 迁移到新文件
  3. 在 ProblemList 和 ProblemDetail 中改为 import 引用
  4. 删除两个文件中的重复代码
- **风险**: 低，纯提取重构
- **收益**: 减少约 130 行重复代码，后续修改只需改一处

### 3.5 删除操作添加确认对话框

- **目标**: 防止用户误操作导致不可恢复的数据丢失
- **涉及文件**:
  - `D:\codehelper\src\modules\ai-chat\SessionList.tsx`（第 128 行）
  - `D:\codehelper\src\modules\settings\SettingsView.tsx`（第 295 行）
  - `D:\codehelper\src\modules\knowledge\KnowledgeView.tsx`（第 130 行）
  - `D:\codehelper\src\modules\mistakes\MistakesView.tsx`（第 129 行）
- **执行步骤**:
  1. 创建通用的 `ConfirmDialog` 组件（放在 `src/components/`）
  2. 在四处删除操作前调用确认弹窗，显示被删除项的名称
  3. 确认后执行删除，取消则关闭弹窗
  4. 可用 `window.confirm` 作为第一版快速实现，后续替换为自定义弹窗
- **风险**: 低
- **收益**: 防误删，提升用户信任感

### 3.6 Console 面板支持可调整大小

- **目标**: 输出面板高度可拖拽调整、可折叠
- **涉及文件**:
  - `D:\codehelper\src\modules\editor\Console.tsx`（第 8 行，`h-48`）
  - `D:\codehelper\src\modules\problems\ProblemDetail.tsx`（第 273 行，`h-40`）
- **执行步骤**:
  1. 创建 `ResizablePanel` 组件，支持拖拽调整高度和双击折叠
  2. 将 Console 和 ProblemDetail 输出区域替换为 `ResizablePanel`
  3. 将用户选择的高度持久化到 localStorage
- **风险**: 中等，需要注意拖拽手柄与编辑器的事件冲突
- **收益**: 显著改善长输出场景下的使用体验

### 3.7 Monaco Editor 共享实例

- **目标**: 避免 Monaco 编辑器被重复加载（约 2MB worker）
- **涉及文件**:
  - `D:\codehelper\src\modules\editor\MonacoEditor.tsx`
  - `D:\codehelper\src\modules\problems\ProblemDetail.tsx`
- **执行步骤**:
  1. 在应用入口（`App.tsx` 或 `main.tsx`）初始化 Monaco loader，配置 `monaco.config({ paths: ... })`
  2. 确保两个组件使用同一个 loader 实例
  3. 验证切换模块时不触发 Monaco 重新加载
- **风险**: 低，`@monaco-editor/react` 原生支持 loader 共享
- **收益**: 首次加载后编辑器切换速度显著提升，减少内存占用

### 3.8 electron-builder 补充跨平台配置

- **目标**: 支持 macOS 和 Linux 构建
- **涉及文件**: `D:\codehelper\electron-builder.yml`
- **执行步骤**:
  1. 添加 `mac` 配置块，设置 `target: dmg`，配置 `icon` 为 `.icns` 格式
  2. 添加 `linux` 配置块，设置 `target: [AppImage, deb]`，配置 `icon` 为 `.png`
  3. 为 Windows 补充 `.ico` 格式图标
  4. 在 CI 中添加多平台构建矩阵
- **风险**: 中等，macOS 签名和公证需要 Apple 开发者账号
- **收益**: 扩大用户覆盖范围

### 3.9 Electron 安全加固（Fuses）

- **目标**: 减少运行时攻击面
- **涉及文件**: `D:\codehelper\electron\main.ts`
- **执行步骤**:
  1. 安装 `@electron/fuses` 包
  2. 在构建脚本中设置以下 fuse：
     - `ELECTRON_RUN_AS_NODE` → Disable
     - `ELECTRON_ENABLE_NODE_OPTIONS` → Disable
     - `nodeOptions` → Disable
  3. 将 `BrowserWindow` 配置中添加 `sandbox: true`
  4. 验证 IPC 通信在 sandbox 模式下正常工作
- **风险**: 中等，sandbox 模式可能影响 preload 脚本的某些 API，需回归测试
- **收益**: 堵住运行时安全漏洞，符合 Electron 安全最佳实践

### 3.10 补充 README.md

- **目标**: 提供项目介绍、安装步骤和开发指南
- **涉及文件**: `D:\codehelper\README.md`（新建）
- **执行步骤**:
  1. 编写项目简介和功能截图
  2. 列出前置依赖（Node.js、Python、GCC 等）
  3. 提供安装和启动步骤
  4. 添加开发指南（如何添加 IPC 通道、如何添加新模块等）
  5. 添加贡献指南和许可证信息
- **风险**: 低
- **收益**: 降低新人上手门槛，提升项目专业度

---

## 四、P1 改进项（尽快执行）

### 4.1 修正 electron-vite 依赖位置

- **目标**: `electron-vite` 从 `dependencies` 移至 `devDependencies`
- **涉及文件**: `D:\codehelper\package.json`（第 21 行）
- **执行步骤**:
  1. `npm uninstall electron-vite`
  2. `npm install -D electron-vite`
  3. 验证 `npm run dev` 和 `npm run build` 正常
- **风险**: 低
- **收益**: 减少打包后应用体积

### 4.2 补充 package.json 元信息

- **目标**: 完善 npm 和 electron-builder 所需的元数据
- **涉及文件**: `D:\codehelper\package.json`
- **执行步骤**:
  1. 添加 `description`、`author`、`keywords`、`repository`、`homepage`、`bugs` 字段
  2. 确保 `version` 语义化（当前应为 `1.0.0`）
- **风险**: 低
- **收益**: 提升可发现性，electron-builder 能正确生成安装包元数据

### 4.3 引入数据库迁移版本管理

- **目标**: 替代 `ensureSchemaColumns` 的逐列检查方式
- **涉及文件**: `D:\codehelper\electron\db\index.ts`
- **执行步骤**:
  1. 创建 `schema_version` 表，记录当前版本号
  2. 将现有 `ensureSchemaColumns` 逻辑封装为迁移脚本（编号为 v1）
  3. 启动时比对版本号，只执行未应用的迁移
  4. 保留回滚能力
- **风险**: 中等，需要确保现有用户的数据库能平滑迁移到新方案
- **收益**: 可维护的 schema 演进方式，方便后续添加新表/列

### 4.4 共享 IPC 通道常量

- **目标**: 消除 preload 白名单与 handler 注册之间的重复
- **涉及文件**:
  - `D:\codehelper\electron\preload.ts`（allowedInvokeChannels）
  - `D:\codehelper\electron\ipc\*.ts`（各 handler）
- **执行步骤**:
  1. 创建 `D:\codehelper\src\shared\ipc-channels.ts`
  2. 定义所有通道名为 `as const` 对象
  3. 在 `preload.ts` 和各 handler 文件中引用同一份常量
  4. TypeScript 会确保新增通道必须在常量中声明
- **风险**: 低
- **收益**: 单一数据源，新增通道时不会遗漏白名单更新

### 4.5 编辑器标签页持久化

- **目标**: 重启应用后恢复上次打开的标签页
- **涉及文件**: `D:\codehelper\src\stores\editorStore.ts`
- **执行步骤**:
  1. 在 store 中添加 `persist` 中间件（或使用 zustand persist）
  2. 持久化字段：`tabs`、`activeTabId`
  3. 启动时从持久化存储恢复，文件不存在则忽略
- **风险**: 低
- **收益**: 用户不需要每次重启都重新打开文件

### 4.6 添加基础键盘快捷键

- **目标**: 提供编辑器和导航的核心快捷键
- **涉及文件**: 新建 `D:\codehelper\src\hooks\useKeyboardShortcuts.ts`
- **执行步骤**:
  1. 实现快捷键 hook，监听全局 `keydown` 事件
  2. 注册以下快捷键：
     - `Ctrl+Enter` → 运行代码
     - `Ctrl+Shift+Enter` → 提交
     - `Ctrl+N` → 新建标签
     - `Ctrl+W` → 关闭标签
     - `Ctrl+B` → 切换侧边栏
  3. 在 App 根组件中挂载 hook
  4. 避免与 Monaco 编辑器内置快捷键冲突
- **风险**: 低，注意 macOS 上 Cmd 键的兼容
- **收益**: 提升键盘操作效率，符合桌面应用用户预期

### 4.7 react-syntax-highlighter 轻量化打包

- **目标**: 减少数百 KB 的打包体积
- **涉及文件**: `D:\codehelper\src\modules\ai-chat\MessageBubble.tsx`（第 4-5 行）
- **执行步骤**:
  1. 将 `import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'` 改为 `import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/light'`
  2. 按需注册常用语言：`python`、`javascript`、`typescript`、`sql`、`cpp`、`java`、`csharp`
  3. 使用 `bundlephobia` 或 `vite-plugin-visualizer` 验证体积变化
- **风险**: 低，需确保 AI 回复中的常见语言都能正确高亮
- **收益**: 打包体积减少数百 KB

### 4.8 优化全局 CSS 过渡动画

- **目标**: 只对交互元素应用过渡，减少不必要的重绘
- **涉及文件**: `D:\codehelper\src\assets\main.css`（第 123-127 行）
- **执行步骤**:
  1. 将 `* { transition-property: ...; }` 的选择器缩小为 `.ui-btn-*`、`.ui-chip*`、`.ui-card`、`.ui-panel` 等交互类名
  2. 保留编辑器排除规则
  3. 用 Chrome DevTools Performance 面板验证重绘区域减少
- **风险**: 低
- **收益**: 减少静态元素的不必要重绘，提升渲染性能

### 4.9 StatusBar 版本号动态读取

- **目标**: 版本号与 `package.json` 保持同步
- **涉及文件**: `D:\codehelper\src\components\StatusBar.tsx`（第 22 行）
- **执行步骤**:
  1. 在 `electron-vite` 配置中使用 `define` 注入 `__APP_VERSION__`
  2. 在 StatusBar 中引用 `__APP_VERSION__` 替代硬编码的 `v1.0.0`
  3. 或在构建时将 `package.json` 的 version 字段复制到环境变量
- **风险**: 低
- **收益**: 版本号自动同步，无需手动维护

### 4.10 关于菜单链接修正

- **目标**: 链接指向实际项目仓库
- **涉及文件**: `D:\codehelper\electron\main.ts`（第 60 行）
- **执行步骤**:
  1. 将 `shell.openExternal('https://github.com')` 改为实际仓库 URL
  2. 可从 `package.json` 的 `repository` 字段读取
- **风险**: 低
- **收益**: 用户能正确访问项目仓库

### 4.11 Windows 图标格式修正

- **目标**: 使用 `.ico` 格式确保 Windows 图标正确显示
- **涉及文件**: `D:\codehelper\electron-builder.yml`（第 8 行）
- **执行步骤**:
  1. 将 `resources/icons/icon.png` 转换为 `.ico` 格式（256x256，包含多尺寸）
  2. 更新 `electron-builder.yml` 中 Windows 的 icon 路径为 `.ico`
  3. 保留 `.png` 用于 macOS 和 Linux
- **风险**: 低
- **收益**: Windows 任务栏和安装程序图标正确显示

### 4.12 运行环境依赖文档

- **目标**: 用户清楚知道需要安装哪些外部工具
- **涉及文件**: `D:\codehelper\README.md`（或 `docs/setup.md`）
- **执行步骤**:
  1. 从 `codeRunner.ts` 提取所有外部依赖：`python`、`gcc`/`g++`、`csc`
  2. 编写各平台的安装指南
  3. 在应用启动时检测关键依赖是否存在，给出友好提示
- **风险**: 低
- **收益**: 用户不会因缺少依赖而困惑

### 4.13 IPC API 文档

- **目标**: 集中记录所有 IPC 通道的参数和返回值
- **涉及文件**: `D:\codehelper\docs\ipc-api.md`（新建）
- **执行步骤**:
  1. 从 `preload.ts` 提取白名单中所有通道名
  2. 从各 handler 文件提取每个通道的参数类型和返回值类型
  3. 按功能模块分组整理为表格
  4. 添加调用示例
- **风险**: 低
- **收益**: 维护者和贡献者能快速理解 IPC 全貌

---

## 五、P2 改进项（后续迭代）

### 5.1 代码质量门禁

- **目标**: 提交前自动执行 lint 和格式化
- **涉及文件**: `.husky/pre-commit`（新建）、`D:\codehelper\package.json`
- **执行步骤**:
  1. 安装 `husky` 和 `lint-staged`
  2. 配置 `.husky/pre-commit` 执行 `lint-staged`
  3. 在 `package.json` 中配置 `lint-staged` 规则
- **风险**: 低
- **收益**: 确保所有提交都符合质量标准

### 5.2 抽取 useAIStream 共享 Hook

- **目标**: 消除 AISidebar 和 ChatView 的流式逻辑重复
- **涉及文件**:
  - `D:\codehelper\src\modules\problems\AISidebar.tsx`（第 29-59 行）
  - `D:\codehelper\src\modules\ai-chat\ChatView.tsx`（第 45-57 行）
- **执行步骤**:
  1. 创建 `D:\codehelper\src\hooks\useAIStream.ts`
  2. 封装 `ai-chat-chunk` / `ai-chat-done` 事件监听和消息状态管理
  3. 在 AISidebar 和 ChatView 中替换为共享 hook
- **风险**: 低
- **收益**: 减少约 60 行重复代码，后续流式逻辑修改只需改一处

### 5.3 ChatView useEffect 依赖修正

- **目标**: 消除 React hooks 规则警告
- **涉及文件**: `D:\codehelper\src\modules\ai-chat\ChatView.tsx`（第 29-34 行）
- **执行步骤**:
  1. 将 `loadConfigs` 和 `loadSessions` 用 `useCallback` 包裹
  2. 或使用 `useRef` 标记初始化状态，避免重复加载
- **风险**: 低，注意不要触发无限重渲染
- **收益**: 符合 React hooks 规则，避免潜在的 stale closure 问题

### 5.4 记忆检索优化

- **目标**: 避免全表扫描，提升大数据量下的检索速度
- **涉及文件**: `D:\codehelper\electron\ipc\chat.ts`（第 231 行）
- **执行步骤**:
  1. 为 `memories` 表的 `enabled` 字段添加索引
  2. 评估是否引入 FTS5 全文搜索
  3. 将 JS 端评分逻辑下沉为 SQL 查询（至少做初筛）
- **风险**: 中等，需评估 FTS5 对数据库大小和写入性能的影响
- **收益**: 记忆条目增多后检索速度保持稳定

### 5.5 知识库搜索引入 FTS5

- **目标**: 替代多个 `LIKE '%keyword%'` 查询
- **涉及文件**: `D:\codehelper\electron\ipc\rag.ts`（第 86-113 行）
- **执行步骤**:
  1. 创建 FTS5 虚拟表，映射文档内容
  2. 修改搜索逻辑使用 FTS5 的 `MATCH` 语法
  3. 重建 FTS 索引的触发器
- **风险**: 中等，需处理中文分词问题（FTS5 默认对中文支持有限）
- **收益**: 搜索速度和相关性显著提升

### 5.6 同步文件读取改异步

- **目标**: 避免阻塞 Electron 主进程
- **涉及文件**:
  - `D:\codehelper\electron\db\index.ts`（第 17-28 行）
  - `D:\codehelper\electron\ipc\problems.ts`（第 167 行）
- **执行步骤**:
  1. 将 `readFileSync` 替换为 `fs.promises.readFile`
  2. 将 `readdirSync` 替换为 `fs.promises.readdir`
  3. `syncProblems()` 改为异步函数，IPC handler 使用 `await` 调用
- **风险**: 低，需注意初始化时序
- **收益**: 主进程启动更快，UI 不卡顿

### 5.7 ChatView 输入框自适应高度

- **目标**: 输入长文本时自动扩展输入框
- **涉及文件**: `D:\codehelper\src\modules\ai-chat\ChatView.tsx`（第 165 行）
- **执行步骤**:
  1. 将 `<textarea rows={2}>` 替换为自适应组件
  2. 监听 `input` 事件，动态计算内容高度并设置
  3. 设置最大高度（如 200px），超出后显示滚动条
- **风险**: 低
- **收益**: 长文本输入体验改善

### 5.8 侧边栏文字标签

- **目标**: 新用户能快速理解导航图标含义
- **涉及文件**: `D:\codehelper\src\components\Sidebar.tsx`
- **执行步骤**:
  1. hover 时展开侧边栏，显示文字标签（带过渡动画）
  2. 或提供侧边栏展开/收起按钮
  3. 持久化用户偏好到 localStorage
- **风险**: 低
- **收益**: 降低新用户学习成本

### 5.9 首次使用引导

- **目标**: 帮助新用户快速上手核心功能
- **涉及文件**: 新建 `D:\codehelper\src\components\Onboarding.tsx`
- **执行步骤**:
  1. 检测 `localStorage` 中是否有 `onboarding_completed` 标记
  2. 首次打开时显示引导步骤：配置 AI → 上传知识库 → 浏览题目 → 运行代码
  3. 完成后写入标记
- **风险**: 低
- **收益**: 提升新用户留存率

### 5.10 自动更新机制

- **目标**: 用户无需手动下载即可获取新版本
- **涉及文件**: `D:\codehelper\electron\main.ts`、`D:\codehelper\package.json`
- **执行步骤**:
  1. 安装 `electron-updater`
  2. 在 main 进程中配置自动检查更新逻辑
  3. 添加更新可用、下载中、下载完成的 UI 提示
  4. 在 electron-builder.yml 中配置 `publish` 字段（GitHub Releases 或自建服务器）
- **风险**: 中等，需要配置签名证书和发布服务器
- **收益**: 用户自动获取最新版本，减少版本碎片化

---

## 六、执行顺序建议

```
第 1 周 ── 基础设施
  ├─ 3.1  引入 Lint / Format / Test 工具链
  ├─ 3.2  补充核心单元测试
  ├─ 3.3  消除 any 类型
  ├─ 3.10 补充 README.md
  └─ 4.1  修正 electron-vite 依赖
  └─ 4.2  补充 package.json 元信息

第 2 周 ── 架构修复 + 安全加固
  ├─ 3.4  提取标签映射函数
  ├─ 3.9  Electron Fuses 安全加固
  ├─ 4.3  数据库迁移版本管理
  ├─ 4.4  共享 IPC 通道常量
  └─ 4.10 / 4.11 构建配置修正

第 3 周 ── 用户体验
  ├─ 3.5  删除确认对话框
  ├─ 3.6  Console 面板可调大小
  ├─ 4.5  标签页持久化
  ├─ 4.6  键盘快捷键
  ├─ 4.7  语法高亮轻量化
  └─ 4.8  CSS 过渡优化

第 4 周 ── 完善与收尾
  ├─ 3.7  Monaco 共享实例
  ├─ 3.8  跨平台构建配置
  ├─ 4.9  StatusBar 版本号动态化
  ├─ 4.12 运行环境文档
  ├─ 4.13 IPC API 文档
  └─ 5.x  P2 项按需推进
```

> 注: 每周结束后应进行代码审查，确保改动不引入回归。P2 项可以在 P0/P1 全部完成后灵活安排。

---

## 七、不在本次范围的后续建议

以下事项超出本改进计划范围，建议在后续版本中考虑：

1. **国际化 (i18n)**: 当前 UI 为中文硬编码，如面向海外用户需引入 i18n 框架
2. **无障碍访问 (a11y)**: 缺少 ARIA 标签和键盘导航支持
3. **端到端测试**: 建议引入 Playwright 或 Spectron 做 Electron E2E 测试
4. **性能监控**: 可集成 Sentry 或自建错误收集，监控线上崩溃率
5. **主题系统扩展**: 当前 3 套主题硬编码，可考虑支持用户自定义主题或导入 VSCode 主题
6. **数据备份/同步**: SQLite 数据库目前无备份方案，可考虑导出/导入或云同步
7. **插件系统**: 如果用户量增长，可考虑支持第三方插件扩展
8. **移动端适配**: 如果未来需要移动端，需重新评估技术栈

---

## 八、审计中值得保持的设计决策

以下已有设计在改进过程中应继续保持，不要因为重构而破坏：

- Preload 层 IPC 白名单 + 参数序列化校验
- CSP 头部配置（禁止 inline script）
- `safeStorage` 加密 API Key
- WAL 模式 + `foreign_keys` 的 SQLite 配置
- ErrorBoundary 全局错误兜底
- 流式 AI 响应的 `requestId` 去重机制
- 代码运行的并发限制（`MAX_CONCURRENT=5`）和输出大小限制
