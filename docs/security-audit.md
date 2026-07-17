# 安全审计报告

> 审计日期：2026-07-17
>
> 审计范围：`D:\codehelper` 当前 P2-P7 工作树
>
> Git 基线：分支 `SuLi/phase4-knowledge-retrieval`，HEAD `16b228030c212e1df8ca7385611bdd877eb368a7`
>
> 发布目标：Windows x64 Electron 应用

本报告取代 2026-06-02 的历史快照。旧报告中的 Vitest 3、DOMPurify、31 个 IPC 通道及“导航
防御完整”等结论不再适用于当前代码。

## 审计结论

CodeHelper 已具备较强的本地数据恢复、受控执行、Docker 强隔离、Agent 审批和 Windows 发布
供应链门禁，但仍不是“无残余风险”的生产系统。

| 边界                   | 当前结论                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Electron Renderer 隔离 | 通过；sandbox、context isolation、Node 禁用、严格 CSP、顶级导航拦截和 Fuses 已验证          |
| Preload / IPC          | allowlist 与合同矩阵可审计；便携导入导出路径只由主进程原生文件对话框授权                    |
| 本地数据               | 已有验证型 SQLite 快照、导入/迁移前备份；恢复和异地保留仍需人工 runbook，JSON 仅为子集      |
| API Key                | 新保存要求 `safeStorage` 可用并 fail-closed；旧的无 `enc:` 数据仍可兼容读取                 |
| 本地代码执行           | Windows Job Object 和资源限制可降低失控风险，但 local-controlled 仍保留同用户文件/网络权限  |
| Docker 强隔离          | 支持语言使用固定 digest、无网络、只读根、非 root 和资源限制；缺失 daemon/镜像时 fail-closed |
| SQL                    | 独立内存 SQLite utility，有输入、结果和超时限制；不属于 Docker 强隔离                       |
| 知识检索               | 本地混合检索可降级并展示来源；导入内容仍是不可信文本，可能进入 AI 上下文                    |
| Agent                  | 主进程白名单、逐次审批、取消和 SQLite 审计已实现；不开放普通终端、文件写入或浏览器工具      |
| 依赖                   | 生产与完整依赖树 audit 均为 0；Vite/esbuild 与 form-data advisory 已关闭                    |
| Windows 发布           | 未签名 Authenticode、安装和不可变资产门禁完整；仍缺少独立发布者身份信任                     |
| 自动更新               | 只生成和验证 updater metadata；应用内检查、下载和安装未实现                                 |

当前没有开放的 High 或 Low 安全发现。SEC-004 仍作为 1 个 Medium 兼容性风险接受项保留，SEC-003
为已缓解信息项；其余 SEC-001/002/005/006/007/008 均已通过实现和自动化验证关闭。

## 威胁模型

### 需要保护的资产

- SQLite 中的工作区、练习草稿、聊天、知识、学习记录和 Agent 审计；
- localStorage 中尚未同步的恢复内容；
- AI Provider API Key；
- 用户运行的代码和输出；
- 导入的知识文件及发送到第三方 Provider 的上下文；
- 签名证书、release tag/SHA、安装包和更新 metadata；
- 用户对 Agent 工具调用的审批记录。

### 不可信输入

- Renderer 中可被注入或错误处理的内容；
- 用户选择的代码、stdin、SQL、JSON、Markdown、PDF 和资源包；
- 知识检索结果和外部 AI Provider 返回内容；
- 本机工具链、Docker daemon 和镜像状态；
- 下载的 Release 资产和 GitHub API 状态；
- 旧版本数据库和损坏恢复文件。

### 不在本应用边界内

已控制操作系统账户、内核、管理员权限、Docker daemon 或签名私钥的攻击者不在应用沙箱可防御
范围内。local-controlled 执行也不承诺阻止当前用户权限下的文件或网络访问。

## 已处置与残余发现

### SEC-001 [HIGH]：主窗口导航已 fail-closed

**证据**：`electron/utils/navigationGuard.ts` 只允许当前本地 Renderer 文档。`will-navigate`、
`will-redirect` 和新窗口入口统一 fail-closed；HTTP/HTTPS 外链交给 `shell.openExternal`，非法协议、
错误 URL、过长 URL 和非预期 `file:` 文档均被拒绝。

`tests/navigationGuard.test.ts` 覆盖开发与打包 Renderer、同窗口外链、重定向、非法协议、子 frame
和非本地 Renderer 配置；完整 Electron E2E 24/24 与 Windows packaged smoke 均通过。

**状态**：Fixed，2026-07-17。

### SEC-002 [MEDIUM]：显式路径导入导出已移出 Renderer IPC

**证据**：`electron/preload.ts` allowlist 只保留 `export-data` 和 `import-data`；
`electron/ipc/export.ts` 不再注册 `export-data-to-path` 或 `import-data-from-path`。读写路径只能来自
主进程 `showSaveDialog` / `showOpenDialog` 的返回值，并继续校验 `.json` 后缀和父目录。

回归测试同时断言原始路径 handler 未注册，且即使 Renderer 向保留通道追加路径形态参数，实际
读写仍只使用原生对话框返回的授权路径。

**残余边界**：用户仍可在原生对话框中主动选择当前账户有权访问的任意 JSON 路径；这是一次性、
可见的用户授权，不再是 Renderer 可静默指定的文件系统能力。

**状态**：Fixed，2026-07-17。

### SEC-003 [INFORMATIONAL]：JSON 子集与完整数据库备份已明确分层

**证据**：JSON 只覆盖 10 类表，不包括编辑器工作区、练习草稿、Agent 审计、课程数据、AI 配置
和 localStorage 恢复层。导出在单一 SQLite transaction 中读取；导入只接受版本 1、最大 32 MB
且总记录数不超过 100,000 的文件，写入前创建 `pre-import` 已验证快照，并在任一行错误时回滚
整个 transaction。

设置页另提供基于 `VACUUM INTO` 的完整 SQLite 快照；手动创建前要求所有窗口 flush，数据库
迁移前也会创建 `pre-migration` 快照。每个快照有应用/schema 版本、大小、SHA-256、quick check
和完整性 manifest。

**残余边界**：快照仍位于同一 `userData`，不包含 localStorage 临时恢复层，且没有应用内恢复或
删除功能。JSON 仍不能作为完整恢复点，导入设置也可能携带旧机器内部状态或本机路径。

**状态**：Mitigated。异地复制、保留策略和人工恢复步骤见
[备份与恢复手册](guides/backup-restore-runbook.md)。

### SEC-004 [MEDIUM]：旧无前缀 API Key 仍按明文兼容读取

**证据**：新保存路径在 `safeStorage` 不可用或 Linux backend 为 `basic_text` 时抛错；但解密函数
仍会直接返回不以 `enc:` 开头的旧值，以兼容历史数据库。

**影响**：升级前曾以明文保存的 API Key 不会自动重加密。完整数据库备份或本机磁盘读取仍可能
暴露这类遗留值。

**要求**：能力状态或设置页应明确 secure storage 可用性；发现旧无前缀值时要求用户重新保存或
轮换凭据。禁止把数据库、JSON 或日志上传到公开问题单。

**状态**：Accepted compatibility risk，需迁移/轮换策略。

### SEC-005 [MEDIUM]：构建依赖 High advisory 已关闭

`electron-builder -> electron-publish` 当前解析到 `form-data@4.0.6`，不再命中
`GHSA-hmw2-7cc7-3qxx`。升级后完整 `npm audit`、构建、Electron E2E 和 Windows package smoke
均通过。

**状态**：Fixed，2026-07-17。

### SEC-006 [LOW]：生产 CSP 已固定 `base-uri` 和 `form-action`

开发与生产 CSP 均显式包含 `base-uri 'self'` 与 `form-action 'self'`，并由
`tests/electronStartupConfig.test.ts` 回归覆盖。

**状态**：Fixed，2026-07-17。

### SEC-007 [LOW]：BrowserWindow 安全默认值已显式固定

主窗口显式设置 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、
`webSecurity: true`、`navigateOnDragDrop: false`、`webviewTag: false`、
`allowRunningInsecureContent: false` 和 `experimentalFeatures: false`。

**状态**：Fixed，2026-07-17。preload、Electron E2E 和 packaged smoke 均已通过。

### SEC-008 [LOW]：开发依赖 esbuild advisory 已关闭

Vite 已升级到 `7.3.6`，其构建实例解析到 `esbuild@0.28.1`，不再命中
`GHSA-g7r4-m6w7-qqqr`。`electron-vite` 自身的 `esbuild@0.25.12` 不在受影响范围。

**状态**：Fixed，2026-07-17。

## 已验证控制

### Electron 与 CSP

- `sandbox` 与 `contextIsolation` 已启用，Renderer 无直接 Node.js 集成。
- `webSecurity` 启用，拖放导航、webview、不安全内容和实验特性均显式禁用。
- 生产 CSP 的 `script-src` 不包含 `unsafe-inline` 或 `unsafe-eval`；开发模式只对本地 Vite/HMR
  放宽。
- 新窗口与顶级导航统一 fail-closed，HTTP/HTTPS 外链通过系统浏览器打开。
- Electron Fuses 禁用 RunAsNode、NODE_OPTIONS 和 CLI inspect，启用 cookie 加密、ASAR 完整性
  与 OnlyLoadAppFromAsar。

新窗口防御和顶级导航防御作为两条独立边界均有自动化覆盖。

### Preload 与 IPC

- preload 使用显式 allowlist，目前为 113 个 invoke 和 4 个 event 通道。
- 序列化检查拒绝 function、symbol、bigint、自定义构造函数和超过 10 层的对象。
- `tests/ipcContractMatrix.test.ts` 对 preload allowlist、主进程注册、Renderer 使用和文档矩阵做精确
  对齐。
- 合同矩阵区分 `available`、`requires-environment`、`degraded` 和 `placeholder`，避免把后端占位
  当作真实能力。

仍有大量 Handler 直接使用 `ipcMain.handle()`，没有统一中间件；安全性依赖各 Handler 自己的
校验。新增通道必须同步更新 allowlist、合同矩阵、Handler 校验和测试。

### 数据与数据库

- SQL 查询普遍使用 prepared statements 和参数绑定。
- 启动时对已有数据库执行 `PRAGMA quick_check`；损坏 DB/WAL/SHM 会原地隔离为
  `.corrupt.<timestamp>`，新数据库不会覆盖隔离副本。
- 编辑器工作区、练习草稿和恢复来源使用 revision、乐观并发及显式冲突路径。
- 设置页在所有窗口 flush 后使用 `VACUUM INTO` 创建完整 SQLite 快照，并以应用/schema 版本、
  文件大小、SHA-256 和 `quick_check` manifest 验证；flush 或验证失败时 fail-closed。
- JSON 导入和数据库迁移分别要求先创建 `pre-import`、`pre-migration` 已验证快照；备份失败时
  不继续写入或迁移，导入行错误会回滚整个 transaction。
- SQLite 是权威存储，localStorage 只承担临时恢复；灾难恢复仍需另外复制完整 `userData`。
- 快照目录仍在同一 `userData`，当前没有应用内恢复/删除，也不会自动把 `.corrupt.*` 合并回
  新数据库。

### API Key

- 新保存的 API Key 必须通过 Electron `safeStorage` 加密，以 `enc:` 密文存入 SQLite。
- `safeStorage` 不可用或 Linux backend 为 `basic_text` 时保存 fail-closed，不再静默写入新明文。
- Renderer 获取配置时只得到掩码和 `has_api_key` 状态。
- Provider 请求前才在主进程解密，失败则拒绝调用。

SEC-004 所述旧无前缀记录仍需单独治理。跨设备完整备份不能保证凭据可解密。

### 代码执行

local-controlled 模式的非 SQL 代码在一次性 Electron utility 进程中运行：

- Windows 使用 fail-closed Job Object、kill-on-close、32 进程、单进程 384 MB 和 Job 768 MB
  限制；
- 所有平台有 10 秒超时、1 MB 合并输出、5 并发和 50 MB 临时目录配额；
- POSIX 使用 process group 与 best-effort ulimit，资源边界弱于 Windows；
- 临时目录扫描不跟随符号链接或 junction，扫描失败保守终止；
- 缺失工具链返回明确安装提示。

local-controlled 不是沙箱。代码保留当前用户的文件系统和网络权限，UI 必须继续要求明确确认。

Docker strong-isolation 支持 Python、Node、C、C++ 和 C#：

- 镜像使用固定 tag + digest，不自动拉取；
- `--network none`、只读 source mount、只读根、`cap-drop ALL`、no-new-privileges、非 root；
- CPU、内存、PID 和 tmpfs 限制；
- `--cidfile` 记录容器，超时、输出超限和异常退出时执行 `docker rm -f`；
- daemon 或镜像缺失时 fail-closed，不退回本地执行。

SQL 继续使用独立内存 SQLite utility，不支持 strong-isolation。

### 知识检索与 Agent

- 知识导入通过系统文件对话框选择，支持的单文件最大 10 MB。
- 检索优先使用 SQLite FTS5/BM25、trigram、本地 n-gram 与 RRF，并在不可用时显示降级原因。
- 结果展示文件名、分块锚点、通道和分数，避免伪造来源。
- 导入文档是不可信内容；进入 AI 上下文前不能把其中的指令视为系统权限。

Agent 工具由主进程白名单定义：

- 知识搜索为只读工具；
- 强隔离代码执行只有 Docker ready 时出现，并要求逐次审批；
- 每次运行、工具调用、审批、取消、失败和完成都写入 SQLite；
- 待执行代码只在必要生命周期内保存，终态清理正文并保留长度、语言和 SHA-256；
- 不开放普通终端、任意文件写入或浏览器控制。

### 发布供应链

正式 Windows workflow：

- 只允许活跃的 `TIANWEN-cpu/CodeHelper-Studio` 仓库；
- 从已存在的语义化 tag 解析完整 SHA，并验证默认分支可达；
- 使用 `release` Environment，并固定未签名发布模式、关闭自动证书发现、拒绝签名变量注入；
- 安装程序、Portable、unpacked/installed 应用、卸载程序和 Job Host 的 Authenticode 必须精确为
  `NotSigned`，未知错误、损坏签名或意外证书都会失败；
- 验证 Electron Fuses、资源、`latest.yml`、Job Host hash、NSIS 和 Portable 两阶段 smoke；
- packaged smoke 使用隔离临时 `userData`，覆盖工作区、SQL、Node Job Host、知识来源、Agent 来源和
  Agent 取消终态；
- 只允许六项资产，先创建 draft，再下载校验后公开；
- 公开后要求 GitHub API `immutable === true`，再次下载并比较 staged bytes、SHA-256 和 server
  digest。

正式发布仍依赖活跃仓库、适当治理的 Environment 和 GitHub Immutable Releases。本地产物不能
直接改名上传；官方资产必须由 release SHA 重新构建，并通过未签名 Authenticode、哈希和运行门禁。

`latest.yml` 和 blockmap 只是更新 metadata。当前没有 `electron-updater` 依赖或 `autoUpdater`
主进程流程，不存在应用内自动检查、下载或安装更新。

## 依赖审计

2026-07-17 收口后的结果：

```text
npm audit --omit=dev --json  -> 0 vulnerabilities
npm audit --json             -> 0 vulnerabilities
```

完整路径和处置见 [依赖审计报告](dependency-audit.md)。旧的 Vitest critical 和 DOMPurify
moderate 记录已经关闭，不能继续出现在风险接受表中。

## 风险接受与发布阻断

| ID      | 状态     | 发布判断               | 重新检查条件                                     |
| ------- | -------- | ---------------------- | ------------------------------------------------ |
| SEC-001 | Fixed    | 不阻断                 | 保持导航守卫及 Electron 回归覆盖                 |
| SEC-002 | Fixed    | 不阻断                 | 保持原始路径通道未注册，并保留对话框授权回归测试 |
| SEC-003 | 已缓解   | 信息项                 | SQLite 快照、事务导入和数据边界继续保持回归覆盖  |
| SEC-004 | Accepted | 不阻断，需凭据迁移提示 | 旧明文行迁移/轮换完成                            |
| SEC-005 | Fixed    | 不阻断                 | 保持完整 audit 与 Windows package smoke          |
| SEC-006 | Fixed    | 不阻断                 | 保持 CSP 指令回归覆盖                            |
| SEC-007 | Fixed    | 不阻断                 | 保持 BrowserWindow 配置与 packaged smoke         |
| SEC-008 | Fixed    | 不阻断                 | 依赖升级后持续运行完整 audit                     |

风险接受必须记录负责人、理由、到期时间和可达性证据。不能继续使用“当前无需立即修复”作为笼统
结论。

## 验证命令

安全相关变更至少执行：

```bash
npm audit --omit=dev --audit-level=high
npm audit --json
npm test
npm run typecheck
npm run lint
npm run format:check
npm run test:e2e
npm run test:docker-isolation
npm run test:knowledge-retrieval
npm run test:agent-tools
npm run test:electron-drafts
npm run test:electron-workspace
npm run test:electron-database-recovery
npm run test:electron-sql
npm run test:electron-runner
npm run test:job-host
```

正式 Windows 环境还要执行 `npm run build:win`，并保存签名、manifest、不可变 Release 和发布后
重新下载证据。跳过的 Docker 或环境测试必须单独列出，不能被“全量通过”一句话隐藏。

## See Also

- [依赖审计报告](dependency-audit.md)
- [安全模型](concepts/security-model.md)
- [数据可移植性](data-portability.md)
- [备份与恢复手册](guides/backup-restore-runbook.md)
- [发布回滚手册](guides/rollback-runbook.md)
- [构建与发布](guides/deployment.md)
- [发布与回滚清单](guides/release-checklist.md)
