# CodeHelper 依赖审计报告

> 审计日期：2026-08-01
>
> 审计基线：工作树 HEAD `4cb4e6e5227785386d980a2323ded27485e02a59`（v2.4.1）及本地未提交增量
>
> 审计命令：`npm audit --omit=dev --json`、`npm audit --json`、`npm ls`

依赖审计必须区分生产运行时和开发/构建供应链。只看 `--omit=dev` 可以证明打包应用的生产依赖
没有 npm 已知漏洞，但不能证明 Electron Builder、Vite 和测试工具链没有风险。

## 当前结果

| 范围                   | Critical | High | Moderate | Low | 结论                            |
| ---------------------- | -------: | ---: | -------: | --: | ------------------------------- |
| `npm audit --omit=dev` |        0 |    0 |        0 |   0 | 生产依赖门禁通过                |
| 完整 `npm audit`       |        1 |   23 |        0 |   0 | 均为开发/构建链，不进入打包产物 |

结果是时间点快照。正式发布应保存命令输出或 CI 日志，不能把本文数字永久当作最新状态。

## 当前未修复的完整审计项（开发/构建链，不随应用发布）

| 包                                  | 等级     | 依赖路径                                                   | 备注                         |
| ----------------------------------- | -------- | ---------------------------------------------------------- | ---------------------------- |
| `tar`                               | Critical | `@electron/rebuild -> node-gyp -> tar`                     | 仅开发期原生模块重建时使用   |
| `@electron/asar`                    | High     | devDep（electron-builder 打包依赖）                        | 修复版 4.x 为破坏性升级      |
| `brace-expansion`                   | High     | `@electron/asar -> ...`（glob 链）                         | 同上                         |
| `minimatch`                         | High     | `@electron/asar` / `glob`（glob 链）                       | 同上                         |
| `glob`                              | High     | `@electron/asar -> minimatch`                              | 同上                         |
| `rimraf`                            | High     | `electron-builder -> ...` 及 `temp` 链                     | 开发/构建脚本工具            |
| `temp`                              | High     | `electron-builder -> electron-winstaller -> temp`          | Windows 安装器生成链         |
| `electron-builder`                  | High     | devDep 本体                                                | 修复版 22.x 为破坏性降级     |
| `app-builder-lib`                   | High     | `electron-builder -> app-builder-lib`                      | 随 electron-builder 一起修复 |
| `@electron/universal`               | High     | `electron-builder -> @electron/universal`                  | macOS 通用构建链             |
| `dmg-builder`                       | High     | `electron-builder -> dmg-builder`                          | macOS 构建链                 |
| `dir-compare`                       | High     | `electron-builder` 依赖                                    | 仅打包校验使用               |
| `electron-builder-squirrel-windows` | High     | `electron-builder -> electron-builder-squirrel-windows`    | Windows Squirrel 链          |
| `electron-winstaller`               | High     | `electron-builder-squirrel-windows -> electron-winstaller` | Windows 安装器链             |
| `ejs`                               | High     | `electron-builder -> app-builder-lib -> ejs`               | 模板渲染（jake 链）          |
| `jake`                              | High     | `app-builder-lib -> jake`                                  | 模板渲染链                   |
| `filelist`                          | High     | `app-builder-lib -> jake -> filelist`                      | 模板渲染链                   |
| `eslint`                            | High     | devDep 本体                                                | 修复版 4.x 为破坏性升级      |
| `@eslint/config-array`              | High     | `eslint -> @eslint/config-array`                           | 随 eslint 一起修复           |
| `@eslint/eslintrc`                  | High     | `eslint -> @eslint/eslintrc`                               | 随 eslint 一起修复           |
| `eslint-plugin-react`               | High     | devDep                                                     | 修复版 7.22.0 为破坏性升级   |
| `fast-uri`                          | High     | `@electron/asar -> ...` / app-builder 链                   | 请求解析链                   |
| `js-yaml`                           | High     | `electron-builder` 配置解析链                              | 构建配置读取                 |
| `postcss`                           | High     | Vite/Tailwind 构建链                                       | 仅构建期 sourcemap 处理      |

以上所有路径均为 `devDependencies` 或构建工具链的传递依赖，不进入 `dependencies`
（`npm audit --omit=dev` 为 0），也不会打包进生产 ASAR/extraResources。完整审计门禁已调整为
“记录不阻塞”（见下文 CI 策略），生产依赖门禁保持 fail-closed。

## 已关闭的旧发现

- `form-data` High（GHSA-hmw2-7cc7-3qxx）：`electron-builder -> electron-publish -> form-data`
  路径已升级到修复版 `4.0.6`，不再命中 advisory。
- `esbuild` Low（GHSA-g7r4-m6w7-qqqr）：Vite 使用其支持的 `esbuild@0.28.1`，已不再命中。
- `vitest@3.2.6` / `@vitest/coverage-v8@3.2.6` critical：当前均为 `4.1.8`。
- `monaco-editor -> dompurify` moderate：当前编辑器依赖链不再安装这两个包。

## 关键依赖基线

| 依赖             | 当前约束   | 用途                           |
| ---------------- | ---------- | ------------------------------ |
| Electron         | `^41.10.3` | 桌面运行时                     |
| electron-builder | `26.15.3`  | Windows 打包与 NSIS 安装器生成 |
| electron-vite    | `^5.0.0`   | 主进程、preload、Renderer 构建 |
| Vite             | `^7.3.6`   | Renderer 构建和开发服务器      |
| esbuild          | `^0.28.1`  | 固定 Vite 的修复版构建实例     |
| Vitest           | `^4.1.8`   | 单元与集成测试                 |
| better-sqlite3   | `^12.8.0`  | 本地 SQLite                    |
| React            | `^19.2.4`  | Renderer UI                    |

版本约束来自 `package.json`；实际解析版本以 `package-lock.json` 和 `npm ls` 为准。

## CI 与发布策略

普通 CI 和正式 Release 当前执行：

```bash
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high || true
```

`--omit=dev` 一行是 fail-closed 硬门禁：生产依赖不得有 High/Critical。完整审计一行只记录、
不阻塞（`|| true`，release.yml 中注释“开发/构建链漏洞仅记录，不阻塞发布；生产依赖门禁在上一行”）——
当前完整审计的 1 Critical + 23 High 全部位于开发/构建链，见上表。发布前安全复核仍应保存
`npm audit --json` 输出并核对路径可达性。

以后完整审计出现新的 High/Critical 时，记录以下信息后再决定阻断或风险接受：

- 精确依赖路径和锁文件版本；
- 是否进入生产 ASAR/extraResources；
- 正式工作流是否调用受影响代码路径；
- 可用修复及升级验证成本；
- 风险接受人、到期时间和重新检查条件。

低于 High 的问题也不能永久忽略，应在依赖升级周期重新扫描。

## 发布证据

每次正式发布至少保存：

- `npm audit --omit=dev` 结果；
- 完整 `npm audit` 结果；
- `package-lock.json` 所在 release SHA；
- 生产 ASAR 与发布资产验证结果；
- 构建依赖审计结果及可达性判断；
- 升级后执行过的 `npm test`、typecheck、lint、Electron E2E 和 Windows package smoke。

## 后续行动

| 项目                       | 优先级 | 完成条件                                   |
| -------------------------- | ------ | ------------------------------------------ |
| 在发布证据中保存完整 audit | Medium | 每个 release run 可追溯生产与完整审计结果  |
| 持续监控构建供应链         | Low    | 新 advisory 在发布前完成处置或限期风险接受 |

## See Also

- [安全审计报告](security-audit.md)
- [构建与发布](guides/deployment.md)
- [发布与回滚清单](guides/release-checklist.md)
- [安全模型](concepts/security-model.md)
