# CodeHelper 依赖审计报告

> 审计日期：2026-07-17
>
> 审计基线：`SuLi/phase4-knowledge-retrieval` 工作树，HEAD `16b228030c212e1df8ca7385611bdd877eb368a7` 及当前 P2-P7 增量
>
> 审计命令：`npm audit --omit=dev --json`、`npm audit --json`、`npm ls`

依赖审计必须区分生产运行时和开发/构建供应链。只看 `--omit=dev` 可以证明打包应用的生产依赖
没有 npm 已知漏洞，但不能证明 Electron Builder、Vite 和测试工具链没有风险。

## 当前结果

| 范围                   | Critical | High | Moderate | Low | 结论             |
| ---------------------- | -------: | ---: | -------: | --: | ---------------- |
| `npm audit --omit=dev` |        0 |    0 |        0 |   0 | 生产依赖门禁通过 |
| 完整 `npm audit`       |        0 |    0 |        0 |   0 | 完整依赖门禁通过 |

结果是时间点快照。正式发布应保存命令输出或 CI 日志，不能把本文数字永久当作最新状态。

## DEP-001：`form-data` High（已关闭）

| 项目     | 记录                                                                   |
| -------- | ---------------------------------------------------------------------- |
| Advisory | `GHSA-hmw2-7cc7-3qxx`                                                  |
| 当前版本 | `form-data@4.0.6`                                                      |
| 依赖路径 | `electron-builder -> app-builder-lib -> electron-publish -> form-data` |
| 影响范围 | 开发/发布构建工具链，不进入打包应用生产依赖                            |
| npm 状态 | 不再命中 advisory                                                      |

Advisory 描述 multipart 字段名和文件名处理中的 CRLF 注入。锁文件已把
`electron-builder -> electron-publish` 路径升级到修复版 `form-data@4.0.6`。升级后完整 audit 为
0，NSIS、Portable、安装、重启持久化、卸载和发布 metadata 验证均通过。

## DEP-002：`esbuild` Low（已关闭）

| 项目     | 记录                         |
| -------- | ---------------------------- |
| Advisory | `GHSA-g7r4-m6w7-qqqr`        |
| 当前实例 | Vite 依赖的 `esbuild@0.28.1` |
| 影响范围 | Windows 本地开发服务器       |
| npm 状态 | 不再命中 advisory            |

Vite 已升级到 `7.3.6`，并使用其支持的 `esbuild@0.28.1`。`electron-vite` 的独立
`esbuild@0.25.12` 不在受影响范围。升级后的构建、单元测试、Electron E2E 和打包均通过。

## 已关闭的旧发现

2026-06-02 报告中的以下结论已失效，不再作为开放风险：

- `vitest@3.2.6` / `@vitest/coverage-v8@3.2.6` critical：当前均为 `4.1.8`。
- `monaco-editor -> dompurify` moderate：当前编辑器依赖链不再安装这两个包。

不要继续复制旧报告中的“等待 Vitest 4”或“等待 Monaco 修复”行动项。

## 关键依赖基线

| 依赖             | 当前约束  | 用途                           |
| ---------------- | --------- | ------------------------------ |
| Electron         | `^41.7.1` | 桌面运行时                     |
| electron-builder | `26.15.3` | Windows 打包与 NSIS 安装器生成 |
| electron-vite    | `^5.0.0`  | 主进程、preload、Renderer 构建 |
| Vite             | `^7.3.6`  | Renderer 构建和开发服务器      |
| esbuild          | `^0.28.1` | 固定 Vite 的修复版构建实例     |
| Vitest           | `^4.1.8`  | 单元与集成测试                 |
| better-sqlite3   | `^12.8.0` | 本地 SQLite                    |
| React            | `^19.2.4` | Renderer UI                    |

版本约束来自 `package.json`；实际解析版本以 `package-lock.json` 和 `npm ls` 为准。

## CI 与发布策略

普通 CI 和正式 Release 当前执行：

```bash
npm audit --omit=dev --audit-level=high
```

它适合作为“生产依赖不得有 High/Critical”的 fail-closed 门禁，但不足以覆盖构建供应链。发布前
安全复核还必须运行：

```bash
npm audit --json
npm ls form-data esbuild electron-builder vite vitest --depth=6
```

以后完整审计再次出现 High/Critical 时，记录以下信息后再决定阻断或风险接受：

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
