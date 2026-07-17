# 构建与发布

> **[< 上一页: 调试指南](debugging.md)** | **[下一页: 发布清单 >](release-checklist.md)**

本文档说明 CodeHelper 的本地构建、Windows 打包和正式发布门禁。当前官方发布目标只有
Windows x64；macOS 和 Linux 配置可用于源码构建，但在具备同等级签名、安装和运行验证前，
不得作为正式 Release 资产上传。

## 构建系统

CodeHelper 使用 **electron-vite** 编译主进程、preload 和 Renderer，使用
**electron-builder** 生成 Windows NSIS 安装包与 Portable 可执行文件。

### Windows 构建流程

```text
精确的 release tag commit
  |
  +-- build-job-host.cjs       -> Windows x64 Job Host
  +-- electron-vite build      -> out/main, out/preload, out/renderer
  +-- electron-builder --win   -> NSIS, Portable, blockmap, latest.yml
  +-- verify-package-resources -> app version, resources, PE architecture, Fuses
  +-- verify-windows-package   -> signatures, install/runtime/uninstall, manifests, hashes
```

### 构建命令

```powershell
# 仅编译应用
npm run build

# 生成 Windows 安装包和 Portable 包，不发布
npm run package:win

# 验证现有 Windows 产物
npm run verify:package:win

# 打包后立即执行完整 Windows 验证
npm run build:win

# 只生成 win-unpacked 并验证资源与 Fuses
npm run package:win:dir
```

本地无签名包只用于构建和安装 smoke，不属于可分发的正式版本：

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm run package:win
npm run verify:package:win
```

不要把无签名 CI 产物改名后上传 Release。正式发布必须在签名环境中重新构建，并让验证器以
`CODEHELPER_REQUIRE_SIGNATURE=1` 运行。

`npm run release:patch`、`release:minor` 和 `release:major` 只负责提升版本并执行本地
`build:win`。它们不会提交代码、创建 Git tag、推送远端或创建 GitHub Release。

## Windows 产物

对于版本 `<version>`，正式 Release 的资产集合固定为：

| 资产                                          | 用途                                |
| --------------------------------------------- | ----------------------------------- |
| `CodeHelper-Installer-<version>.exe`          | Windows x64 NSIS 安装程序           |
| `CodeHelper-Installer-<version>.exe.blockmap` | 增量更新块映射                      |
| `CodeHelper-<version>-Portable.exe`           | Windows x64 免安装版本              |
| `latest.yml`                                  | Electron Updater 兼容 metadata      |
| `release-manifest.json`                       | 源 commit、版本、签名和产物审计记录 |
| `SHA256SUMS.txt`                              | 二进制与更新资产的 SHA-256 校验值   |

`win-unpacked` 只用于构建验证，不上传 GitHub Release。macOS/Linux 产物也不在当前官方资产
集合中。

当前应用没有安装 `electron-updater`，主进程也没有 `autoUpdater` 检查、下载或安装流程。
`latest.yml` 与 blockmap 只是为未来更新客户端和外部审计准备的 metadata；发布它们不等于用户
已经获得应用内自动更新。

## 正式发布环境前提

正式 workflow 只能在活跃仓库 `TIANWEN-cpu/CodeHelper-Studio` 运行。开始前必须人工确认：

- release SHA 已进入受保护默认分支；
- GitHub Environment `release` 已建立，并配置所需审批人和部署限制；
- `CSC_LINK`、`CSC_KEY_PASSWORD` 和预期签名指纹只存放在该受保护 Environment；
- GitHub 仓库已启用 Immutable Releases；workflow 会要求公开后的 Release API
  `immutable === true`；
- tag 已存在且未被移动，同 tag Release 不存在；
- 正式证书和时间戳服务当前可用；
- 操作者已经记录上一个已知良好 Release 和数据回滚方案。

缺少这些外部条件时，本地打包和无签名 smoke 仍可用于开发验证，但不能称为正式发布。

## 正式发布门禁

任何一项失败都必须停止发布，不得降级为警告，也不得静默改用另一个 commit、无签名包或
较弱的运行验证。

### 1. 来源与版本一致性

- 标签必须符合 `vMAJOR.MINOR.PATCH` 语义化版本格式。
- 工作流先解析 tag 指向的完整 SHA，再以 detached HEAD 检出该 SHA；构建和发布阶段都要
  复核 tag 仍指向同一 SHA。
- release SHA 必须可从受保护的默认分支到达，避免从未审查的旁支发布。
- `package.json` 的版本必须与去掉 `v` 的 tag 完全一致。
- `release-manifest.json` 的 `sourceCommit` 必须等于该 release SHA，而不是工作流触发分支的
  偶然 HEAD。

### 2. 回归门禁

正式打包前必须通过生产依赖审计、lint、格式检查、类型检查、单元测试、真实 Electron E2E，
以及草稿、工作区、数据库恢复、数据保护/能力状态、SQL、代码运行器和 Job Host harness。维护
E2E 必须在隔离 `userData` 中验证手动数据库快照、manifest、SHA-256、备份列表和能力状态；这项
源码 Electron E2E 不能用 packaged core-loop 代替。还要保存完整 `npm audit` 结果，单独评估
开发/构建供应链风险。所有测试不得读取或修改真实用户数据库。

Docker integration 在 daemon 或固定镜像缺失时会跳过。发布记录必须列出 skip 数量和原因；
如果正式版本继续宣称 strong-isolation 可用，还必须附上具备全部固定镜像环境中的真实 Docker
integration 证据，不能用“npm test 通过”隐藏关键跳过项。

### 3. Authenticode 签名

- 正式 Windows 构建必须提供 `CSC_LINK` 和 `CSC_KEY_PASSWORD`；缺少任一项立即失败。
- 安装程序、Portable 包、`win-unpacked/CodeHelper.exe` 和安装后的 `CodeHelper.exe` 必须是
  `Valid` Authenticode 状态，并包含可信时间戳。
- 安装程序、Portable 包和应用可执行文件的签名证书指纹必须一致；发布环境配置证书指纹
  pin 时，还必须与该预期指纹一致。
- Windows Job Host 必须通过 x64 PE 校验，具有同一证书的有效 Authenticode 与时间戳，并把
  SHA-256 单独记录进发布清单；不得用外层安装程序签名替代这项验证。

### 4. 资源、Fuses 与更新清单

`npm run verify:package:win` 必须验证：

- `app.asar`、utility 入口、数据库 schema、课程内容、题库、演示资源、资源目录和
  `better-sqlite3` 原生模块均存在。
- `app.asar/package.json` 版本与源码版本一致。
- Job Host 是 Windows x64 PE，且清单中的文件大小和 SHA-256 与实际文件一致。
- 生产 Electron Fuses 符合安全基线：禁用 RunAsNode、NODE_OPTIONS 和 CLI inspect；启用
  cookie 加密、ASAR 完整性验证和 OnlyLoadAppFromAsar。
- `latest.yml` 的版本和路径指向本次安装程序，其 `sha512` 与 `size` 和实际安装程序一致。
- `release-manifest.json` 记录版本、release SHA、workflow commit、生成时间、签名要求、签名
  证书信息、文件大小与 SHA-256；`SHA256SUMS.txt` 覆盖安装程序、blockmap、Portable 和
  `latest.yml`。

### 5. 安装与打包运行验证

验证器在系统临时目录中创建隔离的资源包和 `userData`，不会接触真实用户数据。

- NSIS 安装程序必须支持静默安装到临时目录。
- 正常启动安装后的应用，执行工作区保存、内存 SQL、Node 本地受控 runner、知识导入/检索和
  Agent 知识工具的 packaged core-loop；Node 执行必须经过包内 utility 与 Windows Job Host。
- Agent smoke 必须记录来源为 `package-smoke/release-gate.md#...`，并验证取消请求进入真实终态，
  不能只检查工具列表存在。
- 使用同一临时 `userData` 第二次启动，确认工作区跨重启持久化。
- 静默卸载必须成功，并确认安装目录中的 `CodeHelper.exe` 已消失；卸载失败是发布失败。
- Portable 包必须执行同一套两阶段 core-loop 和重启持久化 smoke。
- smoke 超时、结果 JSON 缺失、资源路径越出临时目录或应用版本不符时都必须 fail-closed。

## GitHub Actions 发布流程

`.github/workflows/release.yml` 只发布已经存在的不可变 tag。tag push 会自动触发；手动触发也
只能选择已有 tag，留空时选择最新语义化版本 tag。

1. **Prepare**：解析 tag/SHA，验证默认分支可达性和版本一致性，运行静态与单元门禁。
2. **Build**：重新复核 tag/SHA，执行 Electron harness，使用受保护签名环境构建并验证。
3. **Stage**：再次复核 tag/SHA 和精确资产集合，通过 create-only API 创建 draft 并上传候选
   资产；如果同 tag Release 已存在则拒绝覆盖。
4. **Verify / Finalize**：从 draft 重新下载全部资产，验证发布清单、GitHub server digest 和
   `sha256sum -c SHA256SUMS.txt`；全部通过后才公开 Release。手动请求 draft 时保持已验证 draft。

最高稳定语义化 tag 才能成为 Latest；prerelease 和补发的旧稳定 tag 必须保持 `latest=false`。
公开后 workflow 再次下载六项资产，比较 staged bytes、SHA-256、文件大小和 GitHub server digest，
并确认 `immutable === true`。失败清理只允许删除本次创建且仍为 draft 的候选，绝不删除已经公开
或不属于当前 run 的 Release。

正式 Release 发布后视为不可变审计记录：不得移动 tag、删除并重建 Release、替换同名资产，
也不得覆盖已发布的更新清单。修复必须使用新 commit、新版本和新 tag。

## 发布凭据

| 变量                           | 用途                  | 约束                                       |
| ------------------------------ | --------------------- | ------------------------------------------ |
| `CSC_LINK`                     | Windows 代码签名证书  | 只存放在受保护的 GitHub Environment secret |
| `CSC_KEY_PASSWORD`             | 证书密码              | 只存放在受保护的 GitHub Environment secret |
| `CODEHELPER_SIGNER_THUMBPRINT` | 预期签名证书指纹      | 建议配置；存在时验证器强制 pin             |
| `CODEHELPER_REQUIRE_SIGNATURE` | 强制验证 Authenticode | 正式发布固定为 `1`                         |

不得把证书、密码、PFX/P12 内容或临时解密文件写入日志、artifact、发布清单或仓库。

## 回滚原则

发布前失败时，取消发布并保留日志；不要移动已经推送的 tag。发布后发现问题时，保留原
Release 及其资产作为证据，通过新的补丁版本修复前进。需要临时回到旧版本时，必须先按
[备份与恢复手册](backup-restore-runbook.md) 创建已验证数据库快照并把完整 `userData` 复制到
外部位置，再在隔离副本中确认旧版本能读取当前 schema；不能确认兼容性时，不得直接用旧安装包
打开新数据。

逐项操作见 [发布与回滚清单](release-checklist.md) 和
[发布回滚手册](rollback-runbook.md)。

## See Also

- [发布与回滚清单](release-checklist.md) -- 正式发布证据、发布后验证和回滚步骤
- [发布回滚手册](rollback-runbook.md) -- 已公开版本事故的可执行处置
- [备份与恢复手册](backup-restore-runbook.md) -- 用户数据保护和恢复验证
- [测试指南](testing.md) -- 单元、集成和 Electron E2E 门禁
- [构建问题排查](../troubleshooting/build-issues.md) -- 构建与打包故障
- [安全审计报告](../security-audit.md) -- Electron、执行隔离和发布供应链边界
- [数据库 Schema](../developer-guide/database-schema.md) -- 迁移与旧数据库验证要求
- [CHANGELOG.md](../../CHANGELOG.md) -- 版本变更日志
