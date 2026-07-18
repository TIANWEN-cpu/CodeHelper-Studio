# 发布与回滚清单

> **[< 上一页: 构建与发布](deployment.md)** | **[下一页: 贡献指南 >](contributing.md)**

本清单用于 CodeHelper Windows x64 正式发布。勾选项必须有对应 workflow 日志、Release 资产
或人工复核记录；“稍后验证”不能替代发布门禁。

## 发布记录

| 项目                | 记录       |
| ------------------- | ---------- |
| 版本                | `v`        |
| Release tag         |            |
| Release SHA         |            |
| 默认分支            |            |
| Workflow run        |            |
| Windows 发布模式    | `unsigned` |
| 上一个已知良好版本  |            |
| 发布负责人 / 审批人 |            |
| 数据回滚负责人      |            |

## 发布前

- [ ] `package.json`、CHANGELOG 和发布说明使用同一个目标版本。
- [ ] 当前仓库为活跃的 `TIANWEN-cpu/CodeHelper-Studio`，不是归档或同名旧仓库。
- [ ] release commit 已进入受保护默认分支，所需审查与 CI 均已完成。
- [ ] 迁移变更已验证旧数据库原地升级；已记录是否允许降级读取。
- [ ] 已复核并记录 GitHub Environment `release` 当前的审批人和部署限制策略；任何缺口均有明确风险记录。
- [ ] GitHub 仓库已启用 Immutable Releases。
- [ ] 已确认 Windows 发布模式为 `unsigned`，自动证书发现关闭，且构建环境未注入签名变量。
- [ ] 已记录上一个已知良好 Release 的 tag、SHA、签名策略和 `SHA256SUMS.txt`。
- [ ] 已在设置页创建并验证手动完整数据库备份，manifest 中的 SHA-256、quick check、应用版本和
      schema 版本均已记录。
- [ ] 知识库维护按[知识库维护流程](knowledge-maintenance.md)完成 audit、dry-run、backup、apply 和
      verify，且计划、规则、备份与最终维护动作快照的指纹一致。
- [ ] 已把关键数据库快照或完整 `userData` 副本复制到原 `userData` 之外，不把同盘备份或 JSON
      导出当作灾难恢复副本。
- [ ] 生产依赖审计、完整依赖审计、lint、格式、类型、单元、Electron E2E 和全部 Electron
      harness 通过或有明确风险记录。
- [ ] `tests/e2e/maintenance.spec.ts` 在隔离 `userData` 中通过，证明运行时能力页、手动备份、
      manifest、SHA-256 和备份列表使用真实 Electron 路径。
- [ ] 自动化证据证明 JSON 导入前创建 `pre-import` 备份、schema 迁移前创建 `pre-migration`
      备份，且备份失败会阻止后续写入或迁移。
- [ ] 已记录所有 skipped tests；Docker strong-isolation 有具备固定镜像环境中的真实 integration
      证据。

## Tag 与来源

- [ ] tag 符合 `vMAJOR.MINOR.PATCH`，且 tag 版本与 `package.json` 完全一致。
- [ ] 已记录 tag 指向的完整 SHA；workflow 使用该 SHA detached checkout。
- [ ] release SHA 可从受保护默认分支到达。
- [ ] Prepare、Build 和 Publish 阶段复核 tag 仍指向同一 SHA。
- [ ] 未删除、移动或复用任何已推送的 release tag。

## 构建与 Authenticode

- [ ] 官方产物由 release SHA 在 Windows runner 上重新构建，不复用本地或普通 CI 产物。
- [ ] `CODEHELPER_WINDOWS_RELEASE_MODE=unsigned`、`CSC_IDENTITY_AUTO_DISCOVERY=false`，且签名变量均未设置。
- [ ] 安装程序、Portable、Job Host、unpacked/installed 应用与卸载程序的 Authenticode 状态均精确为 `NotSigned`。
- [ ] 所有 Authenticode 记录都没有 signer、证书指纹或时间戳证书；未知错误和损坏签名会 fail-closed。
- [ ] Job Host 通过 Windows x64 PE 校验，其大小和 SHA-256 已记录在发布清单。
- [ ] 未向日志、artifact、清单或仓库写入任何签名凭据。

## 包内容与运行

- [ ] `app.asar` 版本、utility 入口、数据库 schema、内容资源和原生模块验证通过。
- [ ] 六项 Electron Fuse 与生产安全基线一致。
- [ ] `latest.yml` 的版本、安装包路径、`sha512` 和 `size` 与真实安装程序一致。
- [ ] NSIS 已静默安装到临时目录，未使用真实用户 `userData`。
- [ ] 安装版 packaged core-loop 已完成工作区保存、SQL、Node 本地受控 runner、知识检索和
      Agent 知识工具，且包内 utility 与 Windows Job Host 路径实际可执行。
- [ ] 安装版和 Portable 的 Agent 证据包含真实知识来源锚点与取消终态。
- [ ] 安装版第二次启动确认工作区持久化。
- [ ] NSIS 静默卸载成功，安装后的 `CodeHelper.exe` 已消失。
- [ ] Portable 已通过相同的 core-loop 和重启持久化 smoke。
- [ ] smoke 临时目录已清理，没有残留 CodeHelper 进程。
- [ ] Portable 自解压目录已由 wrapper 清理，NSIS 卸载后临时安装目录没有任何残留。

## 发布资产

- [ ] Release 只包含以下六个资产，没有 `win-unpacked` 或未验收平台产物：

```text
CodeHelper-Installer-<version>.exe
CodeHelper-Installer-<version>.exe.blockmap
CodeHelper-<version>-Portable.exe
latest.yml
release-manifest.json
SHA256SUMS.txt
```

- [ ] `release-manifest.json` 的版本和 `sourceCommit` 与 tag/SHA 一致，`workflowCommit` 与当前
      workflow SHA 一致。
- [ ] 清单记录 `signatureRequired=false`、生成时间、文件大小、SHA-256 和完整 `NotSigned` 证据。
- [ ] `SHA256SUMS.txt` 覆盖安装程序、blockmap、Portable 和 `latest.yml`，且没有引用缺失或
      额外文件；`release-manifest.json` 另做结构与字段校验。
- [ ] 同 tag GitHub Release 不存在；workflow 使用 create-only API，不会更新或覆盖已有 Release。
- [ ] 候选资产先上传到 draft，只有从该 draft 重新下载并验证成功后才公开为不可变 Release。
- [ ] draft/prerelease 状态与版本策略一致，正式版本未误标为 prerelease。

## 发布后验证

- [ ] 从 staged draft 重新下载资产，而不是复用 runner 工作目录中的文件。
- [ ] 下载目录中的资产名称与允许列表完全一致。
- [ ] 在下载目录执行并通过：

```bash
sha256sum -c SHA256SUMS.txt
```

- [ ] 重新核对下载后的 EXE 均为 `NotSigned`，且没有 signer 或时间戳证书。
- [ ] GitHub Release tag target 与记录的 release SHA 一致。
- [ ] 安装程序和 Portable 各完成一次干净环境启动检查。
- [ ] Release API 返回 `immutable: true`。
- [ ] 公开后再次下载六项资产，与 staged bytes、SHA-256、文件大小和 GitHub server digest 一致。
- [ ] 只有最高稳定语义化 tag 被标记为 Latest；prerelease 和旧稳定补发未抢占 Latest。
- [ ] Release、tag、资产和更新 metadata 已冻结，不再编辑、替换或重建。

## 门禁失败

- [ ] 立即停止 Publish；不得把失败步骤降级为警告。
- [ ] 保留 workflow 日志、诊断 artifact、manifest 和失败样本，记录失败阶段与 SHA。
- [ ] 不移动原 tag，不向同 tag 重传修订资产。
- [ ] 修复进入受保护默认分支后，提升版本并创建新 tag，重新执行完整门禁。

## 发布后回滚

发布后的 Release 是不可变审计记录。回滚不能删除 Release、移动 tag 或替换资产。实际操作按
[发布回滚手册](rollback-runbook.md) 执行，最低要求为：

- [ ] 记录故障版本、tag、SHA、workflow、Release ID、资产哈希和影响范围。
- [ ] 从 GitHub 重新下载已知良好版本并验证其清单声明的签名策略、哈希和 immutable 状态。
- [ ] 完全退出应用后按 [备份与恢复手册](backup-restore-runbook.md) 复制整个 `userData`。
- [ ] 对候选数据库快照核对 manifest、SHA-256、quick check 和 schema，并在隔离副本中完成恢复
      演练；当前应用没有一键恢复。
- [ ] 只在隔离副本中证明旧版本 schema 兼容性，不让旧版本试开唯一当前数据。
- [ ] 卸载后应用目录消失、用户数据仍保留，再安装已验证旧版本。
- [ ] 回退后完成两次启动、数据库 quick check 和核心数据抽查。
- [ ] 通过新 commit、新补丁版本和新 tag 发布前向修复，并归档事件复盘。

## See Also

- [构建与发布](deployment.md) -- 门禁实现与正式发布流程
- [备份与恢复手册](backup-restore-runbook.md) -- 完整 userData 保护与恢复验证
- [发布回滚手册](rollback-runbook.md) -- 已公开版本事故处置
- [故障排除](../troubleshooting.md) -- 数据恢复与打包问题
- [数据库 Schema](../developer-guide/database-schema.md) -- 迁移与兼容性要求
- [安全审计报告](../security-audit.md) -- 发布供应链安全边界
