# CodeHelper v2.4.1 Release Notes

发布日期：2026-07-19

## 概览

v2.4.1 是一次知识库数据质量与阅读体验更新。它清理真实语料中的重复、空页、模板和占位内容，持久化规范分类、来源与链接状态，并用验证型备份、事务写入和维护动作快照保证全过程可审计。

## Windows 发布说明

本版本的 Windows Installer 与 Portable 资产按当前项目策略有意保持未签名。Windows 可能显示
“未知发布者”或触发 SmartScreen；用户应仅从本仓库 Release 下载，并使用随附的
`SHA256SUMS.txt` 校验文件。发布工作流会验证所有相关 EXE 的 Authenticode 状态严格为
`NotSigned`，同时保留完整安装、运行、重启、卸载、资源、Fuses、哈希和 Immutable Release 门禁。

## 亮点

- **真实语料治理**：删除经过复核的同源重复、空页、模板、占位、极短分类 stub 和无入链 sidebar，清理后保留 2141 篇文档与 10618 个 chunks。
- **持久化 metadata**：7 类规范分类、展示标题、来源仓库、源文件、commit、标签、可见性和正文 SHA-256 进入 SQLite。
- **链接审计**：38,470 条相对链接、本地语料、外链与异常状态统一记录并展示；404、临时错误、受限和畸形地址不会混为一类。
- **长文阅读**：新增目录、标题定位、阅读进度、来源信息、全文 AI 上下文和加载失败重试。
- **隐私保护**：不可信 Markdown 不再自动加载第三方图片，外链通过受控 IPC 打开。
- **维护安全**：Windows CLI 严格执行只读审计、dry-run、验证备份、单事务 apply 和只读 verify。

## 安全与依赖

- 人工删除规则绑定文档 ID、文件名、正文哈希和来源信息，防止数据库重建后 ID 复用造成误删。
- 备份 manifest 绑定源数据库身份和计划 SHA，并验证完整文件哈希与 SQLite `quick_check`。
- apply 前后核对核心数据、metadata、链接、FTS、维护运行和每条动作快照；任一失败都会回滚。
- Markdown 图片默认转为显式链接，避免阅读文档时向任意第三方发送请求。
- 完整 `npm audit` 为 0。

## 开发与发布

- 应用 schema 提升至 2，迁移前自动备份；全量 metadata 回填只在 v1 到 v2 时执行。
- 资源包优先使用受控 `manifest.id` 分类，未知知识分类 fail closed。
- 版本脚本同步更新 package 与 lockfile 版本。
- Windows 发布继续使用既有未签名资产、哈希、安装、重启、卸载和 Immutable Release 门禁。

## 验证

- Vitest：2589 通过，2 条专用用例跳过；覆盖率为 Statements 73.06%、Branches 68.38%、Functions 79.17%、Lines 75.48%。
- Python SQLite 维护测试：18/18。
- 知识库 Electron E2E：3/3；真实清理后数据库的隔离副本完成应用 schema 1 到 2 启动迁移，metadata、链接和维护动作指纹保持不变。
- Windows 全量 Electron E2E：25/25；Docker isolation：28/28；知识检索：36/36；Agent：23/23。
- Electron drafts、workspace、database recovery、SQL utility、runner utility 和 Job Host 原生 harness 全部通过。
- TypeScript、ESLint、Prettier、生产构建和生产/完整依赖审计通过。
- Windows package smoke、正式 release workflow 和发布后资产验证由 `v2.4.1` 发布门禁继续执行。

## 升级说明

数据库迁移会在写入前创建验证型快照。升级前应退出旧版本，并把整个 Electron `userData` 目录复制到外部位置。便携 JSON 只覆盖部分逻辑数据，不能替代完整数据库或 `userData` 备份。
