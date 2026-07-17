# CodeHelper v2.4.0 Release Notes

发布日期：2026-07-17

## 概览

v2.4.0 是 CodeHelper 的 Beta Candidate 收口版本。它把此前分散的数据恢复、代码运行、知识库和 AI 工作流整合为可验证的桌面产品闭环，并补齐安全、备份、审计和 Windows 发布门禁。

## 亮点

- **数据丢失防护**：工作区、练习草稿、标签顺序、光标和滚动位置以 SQLite 为权威存储；异常退出、Renderer crash、多窗口分叉和旧 schema 均有真实 Electron 恢复路径。
- **受控代码执行**：代码在一次性 utility 进程中运行；Windows Job Host 提供进程树和资源限制，Docker strong-isolation 默认无网络、只读根、非 root、cap drop 和资源配额。
- **可审计知识检索**：FTS/BM25、trigram 和本地语义近似共同召回，UI 展示来源锚点、检索通道和降级原因。
- **审批型 Agent**：主进程工具白名单、逐次审批、取消/失败终态和 SQLite 审计证据完整落地。
- **数据库保护**：支持验证型 SQLite 快照，导入和迁移前自动备份；每个快照记录版本、大小、SHA-256 与 `quick_check`。
- **统一能力状态**：设置页展示数据库、工具链、Windows Job Host、Docker、知识检索、Agent、AI Provider 与 `safeStorage` 的真实状态。

## 安全与依赖

- 主窗口导航与重定向 fail-closed；外部 HTTP/HTTPS 链接只交给系统浏览器。
- JSON 导入导出路径只能由原生文件对话框授权，Renderer 原始路径 IPC 已移除。
- BrowserWindow 启用 sandbox，并固定 context isolation、webSecurity、webview 和不安全内容选项。
- CSP 增加 `base-uri 'self'` 和 `form-action 'self'`。
- 完整 `npm audit` 为 0。

## 开发与发布

- Node/Vitest 与 Electron 所需的 `better-sqlite3` ABI 会由 npm 命令自动探测切换。
- Windows 构建固定使用含 NSIS `UserProgramFiles` 有界复制修复的 electron-builder 26.15.3。
- Windows 发布链验证 NSIS、Portable、资源、Electron Fuses、安装、启动、重启持久化、卸载、哈希和 updater metadata。
- 正式 GitHub Release 资产限定为 Installer、blockmap、Portable、`latest.yml`、`SHA256SUMS.txt` 和 `release-manifest.json`。

## 验证

- 单元测试与覆盖率：2516 通过，2 条平台/专用 Electron harness 跳过。
- Electron E2E：24/24。
- Docker isolation：28/28。
- 知识检索：33/33。
- Agent：23/23。
- Electron drafts、workspace、database recovery、SQL utility、runner utility 和 Windows Job Host smoke 全部通过。
- TypeScript、ESLint、Prettier、生产构建、完整依赖审计与 Windows package smoke 全部通过。

## 升级说明

数据库迁移会在写入前创建验证型快照。仍建议在升级前退出旧版本，并把整个 Electron `userData` 目录复制到外部位置。便携 JSON 只覆盖部分逻辑数据，不能替代完整数据库或 `userData` 备份。
