# 发布回滚手册

> **[< 上一页：备份与恢复](backup-restore-runbook.md)** | **[下一页：发布清单 >](release-checklist.md)**

本手册处理已公开 Windows Release 出现严重缺陷后的响应。这里的“回滚”是改变推荐版本、保护用户
数据并在确认兼容后安装已知良好版本，不是移动 Git tag、覆盖资产或删除审计证据。

优先方案始终是使用新 commit、新补丁版本和新 tag 修复前进。只有缺陷持续影响用户，且旧版本
及数据兼容性已经得到证据支持时，才执行版本回退。

## 不可违反的边界

- 活跃发布仓库是 `TIANWEN-cpu/CodeHelper-Studio`；不要从归档或同名旧仓库发布。
- 已公开 Release、tag、安装包、Portable、`latest.yml` 和哈希清单都是不可变审计记录。
- 不移动或复用 tag，不替换同名资产，不删除后重建 Release。
- 不让旧应用直接打开唯一的新版本 `userData`。
- 不把卸载当作数据备份；NSIS 配置为 `deleteAppDataOnUninstall: false`。
- 当前应用没有自动更新客户端。改变 GitHub 的 Latest 推荐不会自动替用户降级或安装。

## 触发条件

以下情况可进入回滚评估：

- 启动、保存或迁移导致可重复的数据损坏；
- 清单声明的签名策略、打包资源或发布资产来源无法证明；
- 核心工作区、练习草稿、知识检索或 Agent 审批出现高影响回归；
- 安装、升级或卸载使大量用户无法继续使用；
- 安全事件需要立即停止推荐当前版本。

单一非关键功能故障、可绕过的 UI 问题或尚未验证的报告通常应走新补丁版本，而不是降级用户数据。

## 1. 冻结扩散

记录以下证据：

| 项目               | 记录 |
| ------------------ | ---- |
| 事件 ID            |      |
| 故障版本 / tag     |      |
| Release SHA        |      |
| Workflow run       |      |
| Release ID         |      |
| 六项资产名称和哈希 |      |
| 首次发现时间       |      |
| 影响范围           |      |
| 负责人 / 审批人    |      |

停止主动推荐问题版本，但不要修改其 tag 或资产。若仓库策略允许调整 Latest 指针，可在确认旧版本
后通过 GitHub Releases UI/API 将已知良好稳定版本设为 Latest。随后验证：

```bash
gh api repos/TIANWEN-cpu/CodeHelper-Studio/releases/latest --jq .tag_name
```

输出必须是批准的已知良好 tag。此操作只改变推荐入口，不会改写问题 Release 的 `latest.yml`，
也不会让已安装客户端自动回退。

## 2. 验证已知良好 Release

从 GitHub 重新下载，不使用个人机器上的旧缓存：

```bash
gh release download <known-good-tag> \
  --repo TIANWEN-cpu/CodeHelper-Studio \
  --dir known-good-release
```

验证六项资产集合与该版本的 `release-manifest.json` 一致，并在下载目录执行：

```bash
sha256sum -c SHA256SUMS.txt
```

在 Windows 上检查安装程序、Portable 和应用可执行文件：

```powershell
Get-AuthenticodeSignature .\CodeHelper-Installer-<version>.exe |
  Select-Object Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

必须满足：

- Authenticode 状态与该版本 `release-manifest.json` 的策略一致；当前未签名版本必须为
  `NotSigned`，且 signer 与时间戳证书为空；
- 未来签名版本则必须为 `Valid`，并符合其时间戳和证书指纹记录；
- Release API 的 tag、target commit、draft、prerelease 和 immutable 状态符合记录；
- `SHA256SUMS.txt`、GitHub server digest 和下载字节一致。

## 3. 保护用户数据

在任何卸载或旧版本启动前执行 [备份与恢复手册](backup-restore-runbook.md)：

1. 完全退出所有 CodeHelper 窗口；
2. 确认无 CodeHelper 进程；
3. 复制整个 `%APPDATA%\codehelper`，而不是只复制 `codehelper.db`；
4. 生成 SHA-256 清单；
5. 在副本上运行 `PRAGMA quick_check`；
6. 保留 `.corrupt.*`、Local Storage、DB/WAL/SHM 和启动日志。

若界面显示“仅本地保存”或“恢复降级”，整个 `userData` 备份是强制项，因为最新内容可能不在
SQLite 中。

## 4. 证明 schema 兼容性

CodeHelper 只有部分组件写入 `schema_migrations`，不存在可以自动证明所有降级路径安全的单一
全局版本号。回退决策必须记录：

- 当前应用版本和目标旧版本；
- 当前备份中的 `schema_migrations` 行；
- 两个版本之间新增、重建或删除的表和列；
- 旧版本在隔离副本上的启动和关闭结果；
- 工作区、草稿、聊天、知识、课程和 Agent 数据抽查结果；
- 退出后再次 `PRAGMA quick_check` 的结果。

兼容性测试必须使用虚拟机、独立 Windows 账户或复制的测试 profile。不能证明旧版本可读取当前
schema 时，有两个安全选择：

1. 保持当前数据不动，等待前向修复版本；
2. 恢复与旧版本同一时期、已经验证的完整备份。

不要用旧安装包直接“试开”唯一的当前数据目录。

## 5. 回退已安装版本

1. 完成第 3、4 步并取得审批。
2. 使用当前版本的卸载程序卸载应用。
3. 确认安装目录和 `CodeHelper.exe` 已消失。
4. 确认 `%APPDATA%\codehelper` 仍存在；卸载不应删除用户数据。
5. 安装第 2 步按其签名策略验证过的旧安装包。
6. 只有在 schema 兼容已证明或匹配备份已恢复后才启动旧版本。

Portable 回退同样必须使用重新下载并验证过的可执行文件；Portable 不等于隔离数据目录，不能用
它绕过 schema 兼容性检查。

## 6. 回退后验收

- “关于”页显示目标版本和预期平台；
- 启动时没有新的数据库损坏提示；
- 工作区保存并在第二次启动后恢复；
- 练习草稿、提交和错题可读取；
- 知识导入、检索来源和降级状态正确；
- Agent 只展示真实白名单工具，审批和取消终态正常；
- Node 本地受控执行经过包内 utility 与 Windows Job Host；
- 数据库 quick check 仍为 `ok`；
- 没有残留安装目录、临时 profile 或 CodeHelper 进程。

验收失败时立即退出，保留失败后的 profile，并按备份手册恢复回退前副本。

## 7. 发布前向修复

回退只是控制影响，不能替代修复：

1. 在受保护默认分支提交修复和回归测试；
2. 提升补丁版本；
3. 创建新 tag，不复用问题 tag；
4. 从头执行 [发布与回滚清单](release-checklist.md)；
5. Release Notes 写明受影响版本、数据兼容性、备份要求和恢复步骤；
6. 验证新的最高稳定版本成为 Latest；
7. 保存事件复盘、日志、审批和全部资产证据。

## 关闭事件的证据

事件只有在以下内容全部归档后才能关闭：

- 问题版本及已知良好版本的 tag/SHA/Release ID；
- 原始和重新下载资产的哈希、签名策略证据与 server digest；
- 用户数据备份 ID、哈希和 quick check；
- schema 兼容性结论及测试环境；
- 回退后两次启动的核心闭环结果；
- 修复版本 workflow、不可变 Release 和发布后重新下载验证；
- 根因、影响、修复、预防措施和负责人。

## See Also

- [备份与恢复手册](backup-restore-runbook.md)
- [发布与回滚清单](release-checklist.md)
- [构建与发布](deployment.md)
- [数据可移植性](../data-portability.md)
- [安全审计报告](../security-audit.md)
