# 备份与恢复手册

> **[< 上一页：数据可移植性](../data-portability.md)** | **[下一页：发布回滚 >](rollback-runbook.md)**

本手册用于升级前保护、数据库故障恢复和版本回退。CodeHelper 已提供应用内完整数据库快照，
但当前仍**没有应用内一键恢复**。数据库快照不包含 localStorage 临时恢复层，设置页的 JSON
导入导出也只覆盖部分业务表；灾难恢复仍需要独立保存完整 `userData` 副本。

## 先选择正确的备份

| 目标                           | 应使用的备份                           | 不足                                                     |
| ------------------------------ | -------------------------------------- | -------------------------------------------------------- |
| 快速保护全部已提交 SQLite 数据 | 设置 -> 数据 -> 完整数据库备份         | 位于同一 `userData`；不含 localStorage；没有应用内恢复   |
| 灾难恢复、跨磁盘保护、回退版本 | 完全退出应用后复制整个 `userData` 目录 | 占用空间较大；跨账户时 API Key 可能无法解密              |
| 手工保护 SQLite 已提交数据     | 完全退出后同时复制 DB/WAL/SHM 文件组   | 不含 localStorage，也没有应用生成的 manifest             |
| 迁移部分题目、聊天或知识数据   | 设置页 JSON 导出                       | 只覆盖 10 类表，不含工作区、草稿、Agent 审计和 AI 配置等 |

Windows 默认 `userData` 为 `%APPDATA%\codehelper`。macOS 和 Linux 路径见
[数据库 Schema](../developer-guide/database-schema.md)。正式发布当前只验收 Windows x64，
其他平台仍应遵循“完全退出后复制整个目录”的原则。

## 创建应用内完整数据库备份

在设置页打开“数据”，点击“创建备份”。应用会先请求所有窗口把工作区和练习草稿写入 SQLite；
任一窗口无法完成 flush 时，备份 fail-closed，不会生成一个被标记为成功的快照。

flush 成功后，主进程使用 SQLite `VACUUM INTO` 在 `<userData>/backups` 创建独立 `.db` 快照，
再重新打开快照执行 `PRAGMA quick_check`。设置页会列出已登记备份，并可打开备份目录。

每个快照旁都有 `.manifest.json`，记录：

- `manual`、`pre-import` 或 `pre-migration` 类型；
- 应用版本、应用 schema 与各组件 schema；
- 创建和验证时间、文件大小与 SHA-256；
- `quick_check` 结果和完整性状态。

三类备份的触发时机不同：

| 类型            | 触发时机                                   | 失败行为                   |
| --------------- | ------------------------------------------ | -------------------------- |
| `manual`        | 用户在设置页点击“创建备份”                 | flush 或验证失败时显示错误 |
| `pre-import`    | 已选 JSON 通过格式与规模校验、开始导入前   | 备份失败则不执行导入       |
| `pre-migration` | 已有数据库 schema 低于当前应用、开始迁移前 | 备份失败则不执行迁移       |

应用内快照覆盖全部**已提交的 SQLite 数据**，包括工作区、练习草稿、课程、Agent 审计和 AI 配置；
它不包含只存在于 Chromium localStorage 恢复层的内容。备份目录也仍位于同一 `userData`，因此不能
抵御系统盘损坏、账户目录丢失或误删整个应用数据目录。重要快照应在应用外复制到另一磁盘或受控
备份位置，并保留其 manifest。

当前设置页只能创建、列出和打开备份目录，不能恢复或删除备份。删除、保留周期和异地复制都需
由操作者管理。

## 创建完整 `userData` 外部副本

完整目录副本用于保留 SQLite、localStorage 恢复层、损坏隔离文件和其他 Chromium 状态。它仍是
灾难恢复和版本回退前最完整的保护方式。

### 1. 记录来源

在备份记录中写下：

- CodeHelper 应用版本；
- 操作系统、架构和当前日期；
- 备份原因，例如升级前、数据库恢复横幅或版本回退；
- 当前是否显示“工作区仅本地保存”“恢复降级”或数据库损坏提示。

如果界面显示内容只存在于恢复区，不要先清理缓存或关闭提示。完整 `userData` 备份正是为了保留
这些尚未进入 SQLite 的记录。

### 2. 完全退出应用

关闭所有 CodeHelper 窗口，并确认没有残留进程：

```powershell
Get-Process CodeHelper -ErrorAction SilentlyContinue
```

命令应没有输出。若仍有进程，先正常结束应用；不要在数据库仍写入时复制文件。

### 3. 复制整个目录

选择不在原 `userData` 内的目标目录。示例：

```powershell
$source = Join-Path $env:APPDATA 'codehelper'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $env:USERPROFILE "Documents\CodeHelper-Backup-$stamp"
Copy-Item -LiteralPath $source -Destination $destination -Recurse
```

不要覆盖旧备份。备份目录至少应保留：

- `codehelper.db`；
- 存在时的 `codehelper.db-wal` 和 `codehelper.db-shm`；
- `Local Storage` 等 Chromium 存储目录；
- 任何 `codehelper.db.corrupt.*` 隔离文件；
- 应用配置和其他本地状态。

工作区 migration backup 是 localStorage 键，不是数据库旁边的独立文件。复制整个目录才能保留它。

### 4. 生成文件清单和哈希

```powershell
Get-ChildItem -LiteralPath $destination -Recurse -File |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Path, Hash |
  Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $destination 'SHA256SUMS.csv')
```

记录备份目录大小，并确认哈希清单不为空。恢复前应重新计算并比较哈希，避免使用损坏或复制未完成
的备份。

### 5. 检查 SQLite

若机器上有 SQLite CLI，可在**备份副本**上运行：

```powershell
sqlite3 (Join-Path $destination 'codehelper.db') 'PRAGMA quick_check;'
```

预期唯一结果为 `ok`。没有 SQLite CLI 时，可在 CodeHelper 开发仓库且依赖已安装的环境使用：

```powershell
node -e "const D=require('better-sqlite3');const db=new D(process.argv[1],{readonly:true});console.log(db.pragma('quick_check',{simple:true}));db.close()" (Join-Path $destination 'codehelper.db')
```

quick check 失败的副本仍应保留为取证材料，但不能当作已验证的恢复点。

## 手工 SQLite 文件组副本

优先使用带 manifest 的应用内数据库备份。只有在应用无法启动或需要底层取证时，才在完全退出
应用后同时复制：

```text
codehelper.db
codehelper.db-wal   # 存在时
codehelper.db-shm   # 存在时
```

不要只复制主数据库，也不要在应用运行时猜测 WAL 已经 checkpoint。此方式不包含 localStorage
恢复层，因此不适用于界面明确显示“仅本地保存”或“恢复降级”的情况。

## 恢复应用内数据库快照

设置页没有恢复按钮。数据库级恢复必须由运维或支持人员在副本上完成，不能直接覆盖唯一的当前
数据：

1. 对快照重新计算 SHA-256，与 `.manifest.json` 比较，并运行 `PRAGMA quick_check`。
2. 核对 manifest 中的应用版本、应用 schema 和组件 schema；旧版本不得直接打开更新的 schema。
3. 完全退出 CodeHelper，先创建一份完整 `userData` 外部副本，并确认没有残留进程。
4. 在隔离 Windows 账户、虚拟机或复制的测试 profile 中，把快照作为 `codehelper.db` 使用；不要
   把它覆盖到仍有另一数据库 WAL/SHM 的运行目录中。
5. 启动相同或更新版本，检查 quick check、工作区、练习草稿、课程、Agent 审计和 AI 配置，并
   再重启一次验证持久化。
6. 只有隔离演练通过后，才能按同样方式恢复正式 profile；原 profile 和失败样本必须继续保留。

数据库快照不会恢复 localStorage 临时恢复项。若事故涉及未写入 SQLite 的内容，应恢复完整
`userData` 副本，而不是只恢复 `.db`。

## 恢复完整 `userData` 副本

恢复是破坏性操作，当前没有应用内向导。必须保留当前数据的第二份副本，且不要把不同版本的目录
内容手工拼接。

### 1. 验证候选备份

- 比较 `SHA256SUMS.csv`；
- 对候选数据库运行 `PRAGMA quick_check`；
- 确认备份的应用版本和目标应用版本；
- 确认备份不是唯一副本。

同版本或较新版本读取旧备份通常是预期升级路径。用旧版本读取新 schema 属于降级，必须先在
隔离 Windows 账户、虚拟机或复制的测试 profile 中证明兼容。没有证据时，不要让旧应用打开唯一
的当前 `userData`。

### 2. 保存当前目录

完全退出 CodeHelper 并确认无残留进程。将当前 `%APPDATA%\codehelper` **移动或重命名**为另一个
时间戳目录，不要删除。

### 3. 放回备份

把已验证备份复制到原 `userData` 路径。不要把备份中的单个 DB 文件覆盖到仍含另一版本
localStorage 的目录中；完整备份应作为一个整体恢复。

### 4. 启动和验收

启动目标版本后检查：

- 没有新的数据库损坏横幅；
- 工作区标签、最近关闭标签、光标和内容符合备份时间点；
- 练习草稿能打开且 revision 正常；
- 题目、提交、错题、聊天、知识库和课程记录可读取；
- Agent 历史和审计记录在目标版本支持时可读取；
- 重新启动一次后数据仍然存在。

若 AI 配置无法解密，停止重复尝试并重新输入 API Key。`safeStorage` 密文可能绑定原操作系统账户，
跨设备复制成功不代表凭据可移植。

### 5. 失败时撤回

立即退出应用，保留失败后的目录和日志，再把步骤 2 保存的当前目录恢复。不要反复在同一个唯一
副本上尝试不同版本。

## 数据库损坏隔离

启动时若 `PRAGMA quick_check` 或 SQLite 返回损坏错误，CodeHelper 会把原 DB/WAL/SHM 隔离为
`codehelper.db.corrupt.<timestamp>` 文件，并用新数据库启动。顶部横幅显示主隔离路径；关闭横幅
只表示已知晓，不会删除备份。

当前应用不会自动把 `.corrupt.*` 中的业务记录合并回新数据库，也没有一键恢复按钮。应保留：

- 新数据库；
- 全部 `.corrupt.*` 文件；
- 完整 `userData` 副本；
- 启动日志和横幅内容。

在副本上完成 SQLite 恢复或数据提取后，再使用经过验证的 JSON 或数据库迁移流程导入。不要直接
把损坏文件重命名回 `codehelper.db`。

## JSON 导入前保护

设置页在选择文件前要求二次确认。导入只接受版本 1、最大 32 MB 且总记录数不超过 100,000 的
JSON；验证通过后会先创建 `pre-import` 已验证数据库备份。所有选中类别在同一个 SQLite
transaction 中写入，任一行错误都会使整笔导入回滚，不会保留部分成功结果。`skip` 冲突策略下
明确跳过已有记录不属于错误。成功后仍应完全退出并重启，再核对各类别记录。详细覆盖范围见
[数据可移植性](../data-portability.md)。

## 备份证据模板

| 项目                  | 记录 |
| --------------------- | ---- |
| 备份 ID / 路径        |      |
| 创建时间              |      |
| 应用版本              |      |
| 操作系统 / 架构       |      |
| 备份类型 / 原因       |      |
| 原始恢复状态          |      |
| DB/WAL/SHM 是否存在   |      |
| localStorage 是否包含 |      |
| 应用 / 组件 schema    |      |
| `PRAGMA quick_check`  |      |
| SHA-256 / manifest    |      |
| 恢复测试环境          |      |
| 恢复测试结果          |      |
| 操作人 / 复核人       |      |

## See Also

- [数据可移植性](../data-portability.md)
- [发布回滚手册](rollback-runbook.md)
- [发布与回滚清单](release-checklist.md)
- [数据库故障排除](../troubleshooting.md)
- [安全审计报告](../security-audit.md)
