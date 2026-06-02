# CodeHelper 依赖审计报告

> 审计日期：2026-06-02  
> 审计工具：npm outdated / npm audit / depcheck / 手动代码审查

---

## 1. 概览

| 指标            | 审计前                     | 审计后         |
| --------------- | -------------------------- | -------------- |
| 生产依赖数量    | 12                         | 11             |
| 开发依赖数量    | 19                         | 19             |
| 过期包（major） | 7                          | 7              |
| 已知漏洞        | 4 (2 moderate, 2 critical) | 4 (待手动处理) |
| 未使用依赖      | 1                          | 0              |

---

## 2. 已执行的更新

### 2.1 移除未使用依赖

| 包名                      | 类型         | 说明                        |
| ------------------------- | ------------ | --------------------------- |
| `@electron-toolkit/utils` | dependencies | 源码中无任何 import，纯冗余 |

### 2.2 Semver 兼容更新（已自动完成）

所有在 package.json 版本约束范围内的包已通过 `npm update` 更新到最新兼容版本：

| 包名                | 之前版本 | 当前版本 |
| ------------------- | -------- | -------- |
| `@eslint/js`        | 9.28.x   | 9.39.4   |
| `@tailwindcss/vite` | 4.2.x    | 4.3.0    |
| `@types/react`      | 19.2.x   | 19.2.16  |
| `better-sqlite3`    | 12.8.x   | 12.10.0  |
| `eslint`            | 9.28.x   | 9.39.4   |
| `lucide-react`      | 1.7.x    | 1.17.0   |
| `prettier`          | 3.5.x    | 3.8.3    |
| `react`             | 19.2.x   | 19.2.7   |
| `react-dom`         | 19.2.x   | 19.2.7   |
| `tailwindcss`       | 4.2.x    | 4.3.0    |
| `typescript`        | 6.0.x    | 6.0.3    |
| `typescript-eslint` | 8.33.x   | 8.60.1   |
| `vite`              | 7.0.x    | 7.3.5    |
| `zustand`           | 5.0.x    | 5.0.14   |

---

## 3. 安全漏洞

### 3.1 dompurify (moderate) — 8 个 CVE

- **严重程度**：Moderate
- **影响路径**：`monaco-editor@0.55.1` -> `dompurify@<=3.3.3`
- **CVE 列表**：
  - GHSA-v2wj-7wpq-c8vv — XSS 漏洞
  - GHSA-cjmm-f4jc-qw8r — ADD_ATTR 谓词跳过 URI 验证
  - GHSA-cj63-jhhr-wcxv — USE_PROFILES 原型污染
  - GHSA-39q2-94rc-95cp — ADD_TAGS 绕过 FORBID_TAGS
  - GHSA-h7mw-gpvr-xq4m — FORBID_TAGS 函数谓词绕过
  - GHSA-crv5-9vww-q3g8 — SAFE_FOR_TEMPLATES 绕过
  - GHSA-v9jr-rg53-9pgp — CUSTOM_ELEMENT_HANDLING 原型污染
  - GHSA-h8r8-wccr-v5f2 — Re-Contextualization mutation-XSS
- **修复方案**：需要等待 monaco-editor 升级其 dompurify 依赖到 >=3.3.4。
  - 当前 `npm audit fix --force` 会降级 monaco-editor 到 0.53.0，这是破坏性变更且版本更旧，**不建议执行**。
- **风险评估**：dompurify 仅在 Monaco Editor 内部用于 HTML 净化，本项目作为 Electron 桌面应用，攻击面有限。
- **建议**：持续关注 monaco-editor 新版本发布。

### 3.2 vitest (critical) — 1 个 CVE

- **严重程度**：Critical
- **影响路径**：`vitest@3.2.6`、`@vitest/coverage-v8@3.2.6`
- **CVE**：GHSA-5xrq-8626-4rwp — Vitest UI server 可读取并执行任意文件
- **修复方案**：升级到 `vitest@>=4.1.0`，需要同步升级 `@vitest/coverage-v8`。
- **风险评估**：此漏洞仅在运行 `vitest --ui`（Vitest UI 开发服务器）时可被利用，不影响生产环境。
  - 在 CI 中仅使用 `vitest run`（无 UI server），实际风险较低。
- **建议**：将 vitest + @vitest/coverage-v8 升级到 v4.x（breaking change，需验证测试配置兼容性）。

---

## 4. 过期包（需要 Breaking Change 更新）

以下 7 个包有 major 版本可用，但需要评估兼容性后才能升级：

| 包名                        | 当前版本 | 最新版本 | 说明                                            |
| --------------------------- | -------- | -------- | ----------------------------------------------- |
| `@electron/fuses`           | 1.8.0    | 2.1.1    | Electron Fuses API 变更，需验证 after-pack 脚本 |
| `@vitejs/plugin-react`      | 5.2.0    | 6.0.2    | Vite 插件升级，需配合 Vite 8.x                  |
| `@vitest/coverage-v8`       | 3.2.6    | 4.1.8    | 修复 critical 漏洞，需同步升级 vitest           |
| `electron`                  | 41.7.1   | 42.3.1   | Electron 主版本升级，需全面回归测试             |
| `eslint-plugin-react-hooks` | 5.2.0    | 7.1.1    | ESLint 插件 major 升级                          |
| `vite`                      | 7.3.5    | 8.0.16   | 构建工具 major 升级                             |
| `vitest`                    | 3.2.6    | 4.1.8    | 修复 critical 漏洞                              |

### 建议升级优先级

1. **高优先级**：`vitest` + `@vitest/coverage-v8` -> v4.x（修复 critical 漏洞）
2. **中优先级**：`vite` + `@vitejs/plugin-react` -> v8.x / v6.x（构建工具链升级）
3. **低优先级**：`electron` -> v42.x、`@electron/fuses` -> v2.x、`eslint-plugin-react-hooks` -> v7.x

---

## 5. 未使用依赖

| 包名                      | 类型            | 状态                                                            |
| ------------------------- | --------------- | --------------------------------------------------------------- |
| `@electron-toolkit/utils` | dependencies    | **已移除**                                                      |
| `@vitest/coverage-v8`     | devDependencies | 误报 — 通过 vitest config 中 `coverage.provider: 'v8'` 隐式使用 |
| `tailwindcss`             | devDependencies | 误报 — 通过 `@tailwindcss/vite` 插件隐式使用                    |
| `sql.js`                  | devDependencies | 仅在 `tests/dbSchema.test.ts` 中使用，属于测试工具，保留合理    |

---

## 6. 缺失 Peer 依赖

未检测到缺失的 peer dependency 警告。

---

## 7. CI 改进

已在 `.github/workflows/ci.yml` 中添加 `npm audit` 步骤，确保每次 CI 运行时自动检查已知漏洞。

---

## 8. 后续行动项

- [ ] 将 `vitest` + `@vitest/coverage-v8` 升级到 v4.x（修复 critical CVE）
- [ ] 将 `vite` + `@vitejs/plugin-react` 升级到 v8.x / v6.x
- [ ] 监控 `monaco-editor` 新版本以获取 dompurify 修复
- [ ] 评估 `electron` v42.x 升级的兼容性影响
- [ ] 考虑使用 `npm-check-updates` 定期审查依赖

---

## See Also

- [性能预算](performance-budgets.md) -- 性能目标定义
- [改进计划](improvement-plan.md) -- 改进项与执行进度
- [成熟度改进计划](maturity-plan.md) -- 成熟度提升路线图
- [构建与发布 (指南)](guides/deployment.md) -- 构建流程与版本管理
- [构建问题排查](troubleshooting/build-issues.md) -- 构建与打包故障
- [ADR-001: Electron 选型](adr/001-electron-choice.md) -- Electron 框架选型决策
- [ADR-003: SQLite 选型](adr/003-sqlite-choice.md) -- better-sqlite3 选型决策
- [术语表](glossary.md) -- 技术名词解释
