# 数据可移植性

CodeHelper 有四种用途不同的数据保护方式。它们不能互相替代：

| 数据层               | 覆盖范围                                                  | 适合用途                               | 主要限制                                         |
| -------------------- | --------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| 应用内完整数据库备份 | 全部已提交 SQLite 数据                                    | 日常快照、导入前保护、迁移前回退点     | 不包含 localStorage 临时恢复层；当前不能一键恢复 |
| 完整 `userData` 副本 | SQLite、WAL/SHM、应用内备份、Chromium localStorage 和配置 | 灾难恢复、版本回退、保留未同步恢复内容 | 必须完全退出应用后复制到 `userData` 之外         |
| SQLite 文件组        | `codehelper.db`、存在时的 WAL/SHM                         | 手工保护已提交数据                     | 不包含 localStorage，也没有应用内备份 manifest   |
| JSON 便携子集        | 下文列出的 10 类逻辑数据                                  | 跨设备迁移部分学习数据                 | 不是完整备份，不能重建整个工作区或全部设置       |

完整操作步骤见 [备份与恢复手册](guides/backup-restore-runbook.md)。

## 应用内数据库备份

“设置 -> 数据 -> 创建备份”会：

1. 请求所有 CodeHelper 窗口完成工作区和练习草稿持久化；任一窗口不能确认 SQLite 保存时
   fail-closed。
2. 使用 SQLite `VACUUM INTO` 在 `%APPDATA%\codehelper\backups` 创建独立 `.db` 快照。
3. 以只读方式打开快照并执行 `PRAGMA quick_check`。
4. 记录 SHA-256、文件大小、应用版本、应用 schema 和组件 schema。
5. 原子写入同名 `.manifest.json`。

设置页会列出：

- **手动完整备份**：用户点击“创建备份”。
- **导入前自动备份**：JSON 验证通过后、导入 transaction 开始前创建。
- **迁移前自动备份**：检测到应用 schema 需要升级时，在数据库可写迁移前创建。

这里的“完整”是指全部**已提交 SQLite 数据**。备份目录仍位于同一个 `userData`，磁盘损坏、目录
误删或 profile 丢失会同时影响原库和这些快照。重要备份应通过“打开备份目录”复制到外部位置。

当前应用可以创建、列出并验证数据库备份，但不会自动用某个快照替换当前数据库，也不会删除
备份。恢复仍按 [备份与恢复手册](guides/backup-restore-runbook.md) 人工执行。

## SQLite 与临时恢复层

SQLite 是工作区、练习草稿和主要业务数据的权威存储。数据库位于 Electron `userData`，Windows
默认路径为 `%APPDATA%\codehelper\codehelper.db`。

编辑器和练习模块还会使用 Chromium localStorage 保存异常恢复记录。该层用于 Renderer crash、
异常退出或 SQLite 暂时不可写时保护最新编辑内容，不是第二个权威数据库。

设置页只列出 CodeHelper 边界内名称包含 `.migration-backup.` 或 `.corrupt.` 的诊断恢复项，并可
将它们导出为有界 JSON 副本。它不会在此删除、导入或恢复这些键；普通实时 recovery session 也
不会作为“诊断恢复层”列表导出。

因此：

- 应用内数据库备份开始前会要求所有窗口完成 SQLite 持久化，不能确认时拒绝创建。
- 退出后只复制 DB/WAL/SHM 可以保护 SQLite 数据，但可能漏掉仅存在于 localStorage 的恢复内容。
- 需要灾难恢复或版本回退时，应复制整个 `userData`，并把副本放到原目录之外。

## JSON 导出覆盖范围

便携 JSON 当前覆盖以下 10 类：

| 类别               | SQLite 表          | 内容           |
| ------------------ | ------------------ | -------------- |
| `problems`         | `problems`         | 题目           |
| `submissions`      | `submissions`      | 提交记录       |
| `mistakes`         | `mistakes`         | 错题记录       |
| `chat_sessions`    | `chat_sessions`    | 对话会话       |
| `chat_history`     | `chat_history`     | 对话消息       |
| `knowledge_docs`   | `knowledge_docs`   | 知识文档元数据 |
| `knowledge_chunks` | `knowledge_chunks` | 知识分块       |
| `settings`         | `settings`         | 通用设置键值   |
| `memories`         | `memories`         | 长期记忆       |
| `prompt_presets`   | `prompt_presets`   | 提示词预设     |

JSON 当前**不包含**：

- AI Provider 配置和 API Key；
- 编辑器工作区、标签拓扑、光标和滚动位置；
- 练习草稿与练习计时器；
- 课程进度、课堂笔记、成就和复习计划；
- 分析事件；
- Agent 运行、审批、工具调用和审计日志；
- `schema_migrations` 等数据库内部元数据；
- localStorage 中的工作区、练习和异常恢复记录。

不要把 JSON 文件作为唯一备份，也不要据此宣称“所有用户数据已迁移”。

## 设置界面

数据页提供三个区域：

1. **完整数据库备份**：创建、列出并打开已验证 SQLite 快照目录。
2. **便携数据子集**：导出或导入 10 类 JSON 数据。
3. **临时恢复层**：查看并导出 migration/corrupt 诊断项，不执行恢复或删除。

JSON 导入需要二次确认。文件通过格式校验后，应用先创建已验证的 `pre-import` 数据库备份；
备份失败时不会开始导入。当前 UI 不提供类别选择或冲突策略选择，默认使用 `skip`。

导入成功后应重新打开相关页面；需要确认所有 Store 都从新数据库重载时，完全退出并重新启动
CodeHelper。

## JSON 格式与校验

导出使用固定版本 1，并在一个 SQLite transaction 中读取全部选中类别：

```json
{
  "version": 1,
  "exportedAt": "2026-07-17T00:00:00.000Z",
  "problems": [],
  "submissions": [],
  "mistakes": [],
  "chat_sessions": [],
  "chat_history": [],
  "knowledge_docs": [],
  "knowledge_chunks": [],
  "settings": [],
  "memories": [],
  "prompt_presets": []
}
```

导入器要求 `version === 1`，并校验：

- 文件不超过 32 MB；
- 总记录数不超过 100,000；
- `exportedAt` 为字符串；
- 已知类别为对象数组；
- 冲突策略和类别属于白名单；
- 行中的必需列、主键和 schema 列满足当前数据库要求。

导入在一个 transaction 中运行。任何行错误都会使 transaction 回滚，结果中的 imported 计数
归零；导入前备份仍保留，便于审计和人工恢复。

## 冲突策略

IPC 支持：

- `skip`：保留已有记录，只插入新记录。
- `merge`：只更新导入行明确提供的可变列；设置页当前使用此策略。
- `overwrite`：用导入行覆盖可变列，但不绕过当前表的必需列和约束。

设置页尚未暴露策略或类别选择；服务层会传入 `merge` 和默认的 10 类便携数据。

## 凭据与隐私

JSON 不包含 `ai_configs`，因此不会迁移 API Key。应用内 SQLite 快照和完整 `userData` 会包含 AI
配置密文；Electron `safeStorage` 密文通常绑定操作系统账户或凭据存储，复制到另一台设备或另一
账户后可能无法解密。跨设备迁移后应准备重新输入 API Key。

`settings` 中可能包含账户资料、界面设置和数据库恢复提示等内部值。分享 JSON、恢复层导出或
备份 manifest 前应把它们当作私人诊断数据检查和保管。

## 开发接口

| 通道                              | 参数                   | Renderer 状态  |
| --------------------------------- | ---------------------- | -------------- |
| `database-backups-list`           | 无                     | 数据保护页使用 |
| `database-backup-create`          | 无                     | 数据保护页使用 |
| `database-backups-open-directory` | 无                     | 数据保护页使用 |
| `recovery-layer-export`           | `RecoveryLayerEntry[]` | 数据保护页使用 |
| `export-data`                     | `ExportCategory[]`     | 数据保护页使用 |
| `import-data`                     | `ImportOptions?`       | 数据保护页使用 |
| `export-get-counts`               | 无                     | 无 UI 入口     |

便携数据读写路径只由主进程原生文件对话框返回。Renderer 不接收路径 capability，也没有显式路径
导入导出通道；详见 [安全审计 SEC-002](security-audit.md)。

代码位置：

- 数据保护 UI：`src/views/settings/DataProtectionSettings.tsx`
- Renderer 服务：`src/services/maintenanceService.ts`、`src/services/settingsService.ts`
- 数据库备份：`electron/db/databaseBackup.ts`
- Maintenance IPC：`electron/ipc/maintenance.ts`
- JSON IPC：`electron/ipc/export.ts`

## See Also

- [备份与恢复手册](guides/backup-restore-runbook.md)
- [发布回滚手册](guides/rollback-runbook.md)
- [数据库 Schema](developer-guide/database-schema.md)
- [设置指南](user-guide/settings-guide.md)
- [安全审计报告](security-audit.md)
