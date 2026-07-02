# 技术债备忘

> 由 v2.3.0 发版后的自动化代码改进循环整理。记录需要人工决策、不宜自动执行的待办。

## 1. `tsconfig.web.json` 未启用 strict 模式

**现状**：`tsconfig.node.json`（electron/ 侧）为 `strict: true`，但 `tsconfig.web.json`（src/ 渲染端，代码量最大的区域）为 `strict: false`。这意味着渲染端代码在类型检查时未启用 `noImplicitAny`、`strictNullChecks` 等，存在类型安全缺口。

**为何未自动修**：开启 `strict: true` 几乎必然产生数百个类型错误，需要分批修复，属于多轮重构，不宜在自动循环中一次性开启（会直接让 typecheck/CI 红）。

**建议**：作为独立专项任务，逐目录开启 strict 并修复错误（建议顺序：`src/lib` → `src/utils` → `src/stores` → `src/views`）。

## 2. 开发/构建工具链的传递依赖漏洞（非运行时）

**现状**（`npm audit --audit-level=high`）：

| 包                      | 严重度 | 所属工具链                             | 说明                                          |
| ----------------------- | ------ | -------------------------------------- | --------------------------------------------- |
| `undici` ≤6.26.0        | high   | `node-gyp`（@electron/rebuild）        | HTTP 头注入 / WebSocket DoS / 响应队列投毒 等 |
| `form-data` 4.0.0–4.0.5 | high   | `electron-publish`（electron-builder） | CRLF 注入                                     |
| `esbuild` 0.27.3–0.28.0 | low    | `vite`                                 | 开发服务器任意文件读取（仅 Windows）          |

**为何未自动修**：三者均为**开发/构建期**传递依赖，不会进入打包后的 Electron 应用（应用运行时不含它们）。自动 `npm audit fix` 会改动 lockfile 解析，可能破坏构建工具链兼容性，风险收益比需人工评估。

**建议**：若要修，用 `package.json` 的 `overrides` 字段定点升级这三个传递依赖，并在升级后跑 `npm run build` + `npm run test` + 实际打包验证。这些漏洞对桌面学习应用的实际风险很低（仅构建机/CI 上存在）。

## 3. 历史中的 LRU 式缓存淘汰的"插入顺序"细节（低优先）

`electron/utils/codeRunner.ts` 的 `resolvedPaths` 与 `electron/utils/perfMonitor.ts` 的 `ipcStatsMap` 都用 Map 做"满了淘汰最旧"的简易 LRU。但 Map 在 `set` 已存在的 key 时**不重排插入顺序**，导致频繁使用的命令会一直停留在"最旧"位置、被优先淘汰——只是缓存命中率不理想，无正确性问题。如需真正 LRU，命中时应先 `delete` 再 `set`。

## 4. docs 中残留的 Monaco 引用（大部分为历史性，保留）

项目实际使用 `@uiw/react-codemirror`（CodeMirror 6），`src/theme/monacoThemes.ts` 与 `src/utils/monacoConfig.ts` 已作为死代码删除。

**已修正为 CodeMirror 的「现行/面向用户」文档**：`architecture.md`、`quickstart.md`、`glossary.md`、`docs/README.md`、`developer-guide/architecture.md`、`concepts/architecture.md`、`comparison.md`、`user-guide/editor-guide.md`、`accessibility.md`、`api/utilities.md`、`api/state-management.md`。

**有意保留 Monaco 引用的「历史/审计」文档**（按其撰写时的事实记录，改动会篡改历史）：`adr/*`、`changelog-extended.md`、`release-notes-v1.1.0.md`、`MATURITY_SCORECARD.md`、`PRODUCT_AUDIT.md`、`QUALITY_AUDIT.md`、`STRATEGIC_ASSESSMENT.md`、`improvement-plan.md`、`maturity-plan.md`、`dependency-audit.md`、`security-audit.md`、`project-info/*`、`superpowers/*`、`search-index.md`、`project-info/context/git-log.txt`。

**可选的后续清理**（现行文档，优先级低）：`faq.md`、`features-showcase.md`、`onboarding/*`、`troubleshooting*`、`user-guide/getting-started.md`、`user-guide/settings-guide.md`、`reference/components.md`、`platform-notes.md`、`performance-budgets.md`、`developer-guide/debugging.md` 中仍有零散 Monaco 提及，可按需逐个判断清理。
