# CodeHelper 成熟度评分卡

> 评估日期：2026-07-17
>
> 评估对象：`D:\codehelper` 当前 P2-P7 工作树
>
> 应用版本：`2.4.0`
>
> Git 基线：`v2.4.0` 发布候选分支

本评分卡用于判断产品是否具备继续开发、Beta 和正式发布条件，不替代
[安全审计](security-audit.md)、[发布清单](guides/release-checklist.md)或真实 workflow 证据。

## 等级定义

| 等级 | 名称             | 含义                                         |
| ---- | ---------------- | -------------------------------------------- |
| L1   | Demo             | 基础原型，只在理想条件下可运行               |
| L2   | MVP              | 核心能力可用，但恢复、验证或体验仍不完整     |
| L3   | Beta             | 核心闭环完整，适合受控早期用户               |
| L4   | Production Ready | 正式环境、签名、回滚、安全和支持流程均有证据 |
| L5   | Industry Grade   | 可扩展、可运营并达到长期工程治理标准         |

## 当前结论

**综合等级：L3 Beta Candidate。**

P2-P7 已把项目从原型推进到具备真实数据恢复、代码执行、知识检索、Agent 审批、Windows 打包
门禁、验证型数据库快照和统一能力状态的桌面应用。本地安全、依赖、测试和无签名打包门禁已经
收口；尚未达到 L4 的原因是公开发布仍采用未签名资产，且异地备份/恢复和运营责任等外部与产品化条件未完成。

| 维度       | 当前等级   | 已有证据                                                                         | 主要短板                                             |
| ---------- | ---------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 功能完整度 | L3         | 多标签工作区、练习、聊天、知识、Agent 和本地执行闭环                             | JSON 迁移仅覆盖子集；没有完整恢复向导                |
| 用户体验   | L3         | 恢复/冲突/降级可见，数据保护和统一能力状态页可用                                 | 无应用内恢复；异地复制和备份保留仍依赖人工           |
| 技术架构   | L3         | Electron 进程隔离、SQLite 权威存储、版本化仓储和 IPC 合同矩阵                    | 113 个 invoke 通道，部分 Handler 缺少统一中间件      |
| AI 与检索  | L3         | OpenAI-compatible Provider、本地混合检索、来源和 Agent 工具证据                  | Provider 健康依赖环境；不可信知识内容仍需边界治理    |
| 数据可靠性 | L3         | WAL、损坏隔离、冲突、多窗口、验证型快照及导入/迁移前备份                         | 无应用内恢复；同盘备份和降级读取仍需人工治理         |
| 代码执行   | L3         | Windows Job Object、utility、资源限制和 Docker strong-isolation                  | local-controlled 不是沙箱；POSIX 资源隔离较弱        |
| 测试验证   | L4（本地） | 单元、Electron E2E、Docker、知识、Agent 和真实 Windows package smoke             | 环境相关 skip 必须单独记录；未签名发布有平台信誉风险 |
| 文档质量   | L3         | 架构、IPC、恢复、发布和安全文档齐全                                              | 仍需持续防止历史报告和实现漂移                       |
| 部署能力   | L3         | 精确 tag/SHA、严格 NotSigned 门禁、六资产、draft 校验、immutable 和发布后 digest | 无发布者身份签名；正式 Release 仍待验证              |
| 商业化     | L1         | 本地优先、用户自带 Provider                                                      | 无账号、云同步、托管 AI、定价和运营体系              |

## 已完成的关键成熟化

### 数据可靠性

- SQLite 是工作区和练习草稿的权威存储。
- localStorage 只作为异常恢复层，不能覆盖已提交 SQLite 数据。
- 多窗口使用 revision 和显式冲突解决，未解决 provenance 不会提前清理。
- 启动执行 SQLite quick check；损坏 DB/WAL/SHM 会隔离保留。
- 设置页可在所有窗口 flush 后创建 `VACUUM INTO` 完整 SQLite 快照，并记录应用/schema、大小、
  SHA-256 和 quick check manifest。
- JSON 导入和数据库迁移前自动创建已验证快照；备份失败时 fail-closed，导入行错误会整笔回滚。
- 真实 Electron E2E 覆盖异常退出、Renderer crash、多窗口、旧 schema 和数据库损坏。

### 受控执行

- 非 SQL 代码在一次性 utility 进程中运行。
- Windows 使用 fail-closed Job Object、进程/内存限制和 kill-on-close。
- Docker strong-isolation 使用固定 digest、无网络、只读根、非 root、cap drop 和资源限制。
- 超时、输出上限、临时目录配额和容器清理都有自动化测试。
- UI 明确 local-controlled 不是沙箱，Docker 不可用时不会静默回退。

### 知识与 Agent

- 知识检索使用 FTS/BM25、trigram、本地语义近似和降级召回。
- UI 展示来源锚点、检索通道和降级原因。
- Agent 工具由主进程白名单定义，强隔离执行要求逐次审批。
- 运行、审批、取消、失败和工具输出都有 SQLite 审计证据。

### Windows 发布

- 正式 workflow 锁定现有 tag、完整 SHA、默认分支可达性和仓库身份。
- Windows 包明确要求 Authenticode `NotSigned`，且 signer 与时间戳字段必须为空。
- NSIS 与 Portable 执行两阶段 packaged smoke，验证资源、Job Host、重启持久化和清理。
- Release 先进入 draft，重新下载验证后公开，并要求 GitHub API `immutable === true`。
- 公开后再次下载六项资产，比较 staged bytes、SHA-256 和 server digest。

这些是发布基础设施，不等于已经完成真实正式发布。`release` Environment 和 Immutable Releases
设置仍需在活跃 `CodeHelper-Studio` 仓库完成端到端验证。

## 当前阻断项

### 发布前必须关闭

1. 在活跃仓库完成一次未签名、六资产、不可变 Release 全流程，并保存发布后重新下载证据。
2. 后续若面向更广泛用户分发，再评估代码签名；补签必须发布新版本，不能替换不可变资产。

### Beta 期间必须完成

1. 为 `<userData>/backups` 建立保留周期、异地复制和空间告警策略。
2. 提供应用内恢复向导，或对数据库快照和完整 `userData` 恢复完成可重复演练。
3. 解决旧无前缀 API Key 的迁移/轮换策略。
4. 用当前实现持续更新用户指南，避免把 JSON 子集称为完整迁移。

## 自动更新状态

当前发布产物包含 `latest.yml` 和 blockmap，并验证其中的版本、路径、SHA-512、大小和日期。这只是
Electron Updater 兼容 metadata。

项目当前没有 `electron-updater` 依赖，也没有 `autoUpdater` 主进程流程或更新 UI。因此：

- 已安装用户不会自动检查、下载或安装新版本；
- GitHub Latest 只是下载推荐入口；
- 版本回退也不会自动推送到已安装客户端；
- 实现自动更新必须作为独立功能完成威胁建模、签名验证和 E2E。

## 数据可移植性状态

设置页可创建包含全部已提交 SQLite 数据的验证型快照，并在 JSON 导入和数据库迁移前自动创建
备份。快照仍位于同一 `userData`，不包含 localStorage，也没有应用内恢复或删除功能。

JSON 导入导出只覆盖 10 类逻辑数据，不包含工作区、练习草稿、课程进度、Agent 审计、AI 配置和
localStorage 恢复层。灾难恢复仍需把完整 `userData` 复制到外部位置。详见：

- [数据可移植性](data-portability.md)
- [备份与恢复手册](guides/backup-restore-runbook.md)
- [发布回滚手册](guides/rollback-runbook.md)

## 最近验证基线

2026-07-17 收口验收记录包括：

- 单元测试与覆盖率各 2518 通过、2 条平台/专用 Electron harness 跳过；
- 覆盖率：Statements 71.36%、Branches 66.66%、Functions 76.77%、Lines 73.62%；
- Electron E2E 24/24；
- Docker isolation 28/28；
- 知识检索 33/33；
- Agent 23/23；
- Electron drafts、workspace、database recovery、SQL utility、runner utility 和 Job Host 冒烟通过；
- typecheck、lint、Prettier、`git diff --check`、生产及完整 `npm audit` 通过；
- NSIS 与 Portable 的安装、运行、重启持久化、卸载、资源、Fuses、哈希和 updater metadata 通过。

这些数字是一次验收快照。代码、依赖或 workflow 改动后必须重新运行，不能用本文替代实时结果。

## 达到 L4 的条件

- 发布阻断安全发现保持关闭，并在每次 Release 重跑 Electron/package 门禁；
- 数据库快照具备异地保留策略，恢复路径由产品或稳定运维工具承接并完成演练；
- 面向广泛分发前完成可信发布者签名或等价身份机制，并通过一次不可变正式 Release；
- 发布回滚在隔离数据副本上演练通过；
- 完整依赖审计无未批准 High/Critical；
- 用户支持、隐私、漏洞响应和版本生命周期流程有负责人；
- 如果启用应用内自动更新，签名、回滚和更新攻击面经过独立验收。

## See Also

- [安全审计报告](security-audit.md)
- [依赖审计报告](dependency-audit.md)
- [构建与发布](guides/deployment.md)
- [发布与回滚清单](guides/release-checklist.md)
- [备份与恢复手册](guides/backup-restore-runbook.md)
