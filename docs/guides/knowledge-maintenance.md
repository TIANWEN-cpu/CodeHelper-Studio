# 知识库维护流程

`scripts/knowledge_maintenance.py` 用于对真实知识库执行可审计的离线维护。它把操作拆分为：

```text
audit -> dry-run -> backup -> apply -> verify
```

前两步只读。`apply` 是唯一会修改源数据库的步骤，并要求 Windows 进程保护、未漂移计划和已验证备份同时成立。

## 准备

在 Windows PowerShell 中进入仓库并安装 Python 依赖：

```powershell
Set-Location D:\codehelper
py -m pip install -r .\scripts\requirements-knowledge-maintenance.txt
```

设置本次运行路径：

```powershell
$db = Join-Path $env:APPDATA "CodeHelper\codehelper.db"
$out = ".\output\knowledge-maintenance"
$importBatches = "D:\coderhelperresource\import-batches"
$remoteStatus = ".\codehelper-knowledge-remote-status.json"
New-Item -ItemType Directory -Force $out | Out-Null

function Read-Utf8Json([string]$Path) {
  [System.IO.File]::ReadAllText(
    (Resolve-Path $Path).Path,
    [System.Text.Encoding]::UTF8
  ) | ConvertFrom-Json
}
```

也可以使用仓库内的 PowerShell 包装脚本，避免复制多行命令时发生续行或编码错误：

```powershell
.\scripts\run-knowledge-maintenance.ps1 -Stage plan
.\scripts\run-knowledge-maintenance.ps1 -Stage backup
.\scripts\run-knowledge-maintenance.ps1 -Stage apply -ConfirmApply
.\scripts\run-knowledge-maintenance.ps1 -Stage verify
```

包装脚本不会自动串联到 `apply`，写入阶段必须显式提供 `-ConfirmApply`。脚本还会设置 Python/控制台 UTF-8，通过 `File.ReadAllText(..., Encoding.UTF8)` 读取 JSON，并以无 BOM UTF-8 写入结果，避免 Windows PowerShell 5.1 使用系统默认编码误解 Python 输出。

该工具只治理由受控 `import-batches` 生成、带 YAML frontmatter 且已进入证据链的语料。若数据库还包含设置页临时上传的 TXT、PDF 或无 frontmatter Markdown，`audit` 会 fail closed；不要为了通过审计删除用户文档，应先在隔离副本中补齐可审计的导入映射、规则和证据，再重新生成完整计划。

## 证据工件

`scripts/knowledge-maintenance-rules.json` 固定绑定以下四个 JSON 工件及 SHA-256：

| 规则键              | 文件                                             | 用途                        | SHA-256                                                            |
| ------------------- | ------------------------------------------------ | --------------------------- | ------------------------------------------------------------------ |
| `candidate_inbound` | `codehelper-knowledge-candidate-inbound.json`    | 候选集合和人工复核输入      | `b31916c6ceaa23dd9032dcded643dca69dc5de19070ba8524596f43dcf357919` |
| `readonly_audit`    | `codehelper-knowledge-readonly-audit-local.json` | 只读快照和重复/质量证据     | `7bc4079f4d09d1ab5d487fc9797d6770859f776b0465dfa59f6c94add85b9d38` |
| `remote_status`     | `codehelper-knowledge-remote-status.json`        | 离线远程链接状态清单        | `164aab06df508601d4e3ae7940dcede143c5bc8f15f7646c09be352b0c1db743` |
| `confirmed_404`     | `codehelper-knowledge-confirmed404-fixable.json` | 已确认 404 与可修复链接证据 | `3c4ac04b711baa04a808d6cd5a4a9031fb7ee80c07cd92679a6474fa898ae374` |

`dry-run` 会从规则文件解析四个路径并逐一验证普通文件身份和 SHA-256；缺失、符号链接或哈希不符都会失败。CLI 仅为远程状态提供单独的 `--remote-status` 参数，且该参数必须解析到规则中绑定的同一文件；其余三个工件没有独立参数。加载后，候选和只读证据会与当前审计分析核对，confirmed-404 会与远程状态清单核对。

更换任一证据文件时必须同步更新受审规则和哈希，并重新执行 audit 和 dry-run；不能继续使用旧计划。

## 只读审计

```powershell
py .\scripts\knowledge_maintenance.py audit --db $db --import-batches $importBatches --rules .\scripts\knowledge-maintenance-rules.json --output "$out\audit.json"
if ($LASTEXITCODE -ne 0) { throw "audit failed" }
```

审计会检查核心表、chunk 数量与内容切分一致性、来源字段、同源重复、入链和 import-batch 文件映射。源数据库以 SQLite `mode=ro` 和 `query_only` 打开。

## 生成计划

```powershell
py .\scripts\knowledge_maintenance.py dry-run --db $db --audit "$out\audit.json" --import-batches $importBatches --rules .\scripts\knowledge-maintenance-rules.json --remote-status $remoteStatus --output "$out\plan.json"
if ($LASTEXITCODE -ne 0) { throw "dry-run failed" }
```

检查计划摘要：

```powershell
$plan = Read-Utf8Json "$out\plan.json"
$plan.action_counts
$plan.deletion_reason_counts
$plan.counts_before
$plan.counts_after
```

计划内嵌 metadata 和链接审计目标行，并记录 audit、规则、四个证据工件、数据库和维护表的指纹。规则、证据或数据库发生变化后，旧计划不能继续使用。

## 创建备份

完全退出 CodeHelper、Electron 开发进程及相关 Node 进程。备份和写入必须在 Windows 执行；非 Windows 环境会 fail closed。

```powershell
$backupDir = Join-Path (Split-Path $db) "backups"
$backupJson = (& py .\scripts\knowledge_maintenance.py backup --db $db --plan "$out\plan.json" --backup-directory $backupDir 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0) { $backupJson; throw "backup failed" }
$backupJson | Set-Content "$out\backup-result.json" -Encoding UTF8
$backup = $backupJson | ConvertFrom-Json
$backup | Select-Object status, backup_path, manifest_path, fingerprint
```

备份使用 SQLite `VACUUM INTO`，并验证：

- `quick_check` 与文件完整性
- 备份文件 SHA-256
- 源数据库路径和文件身份
- 清理前知识库与维护表指纹
- 目标计划 SHA-256

## 事务应用

再次确认 CodeHelper/Electron 未运行，然后执行：

```powershell
$applyJson = (& py .\scripts\knowledge_maintenance.py apply --db $db --plan "$out\plan.json" --backup-manifest $backup.manifest_path --yes 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0) { $applyJson; throw "apply failed" }
$applyJson | Set-Content "$out\apply-result.json" -Encoding UTF8
$applyJson | ConvertFrom-Json
```

`apply` 在同一个 `BEGIN IMMEDIATE` 事务内重新检查防漂移状态、创建所需 schema、执行删除、同步 metadata/链接审计、重建 FTS，并写入维护运行与动作快照。任一校验失败都会回滚事务。

## 只读验证

```powershell
py .\scripts\knowledge_maintenance.py verify --db $db --plan "$out\plan.json" --output "$out\verify.json"
if ($LASTEXITCODE -ne 0) { throw "verify failed" }
Read-Utf8Json "$out\verify.json"
```

验证会重新检查数据库路径、文档/chunk/metadata/link 数量与指纹、FK、FTS、维护运行字段、备份路径和每条动作的完整审计快照。

## 恢复边界

不要删除 `.db` 备份及其 `.manifest.json`。发生异常时先保持应用关闭，在隔离副本中验证备份，再按[备份与恢复手册](backup-restore-runbook.md)处理。不要让旧版本应用直接打开唯一的当前数据库。
