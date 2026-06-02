# 性能预算 (Performance Budgets)

本文档定义了 CodeHelper 关键操作的性能目标。所有基准值均基于典型桌面环境（8 核 CPU / 16 GB RAM / SSD）。

## 响应时间预算

| 操作类别             | 预算    | 说明                                                                               |
| -------------------- | ------- | ---------------------------------------------------------------------------------- |
| **IPC 调用**         | < 100ms | Electron 主进程与渲染进程之间的单次 IPC 往返。包括数据库查询、文件读写等本地操作。 |
| **搜索（全文检索）** | < 500ms | 题库搜索、知识库检索等涉及 SQLite FTS 或正则匹配的操作。                           |
| **启动时间**         | < 3s    | 从 `app.whenReady()` 到首屏渲染完成（含初始数据加载）。                            |
| **SQL 解析**         | < 5ms   | `splitSqlStatements` 处理 ≤ 1000 条语句的输入。                                    |
| **文本分块**         | < 10ms  | `splitIntoChunks` 处理 ≤ 50KB 文本。                                               |
| **元数据推断**       | < 1ms   | `normalizeProblemSeed` 单次调用（纯字符串匹配，无 I/O）。                          |
| **正则转义**         | < 0.1ms | `escapeRegExp` 单次调用。                                                          |

## 内存预算

| 资源               | 预算    | 说明                                       |
| ------------------ | ------- | ------------------------------------------ |
| 主进程 RSS         | < 200MB | Electron 主进程常驻内存。                  |
| 渲染进程 RSS       | < 300MB | React 应用 + Monaco Editor。               |
| SQLite 缓存        | < 50MB  | better-sqlite3 页面缓存。                  |
| 单次 AI 会话上下文 | < 10MB  | 聊天历史 + RAG 上下文拼接后的 token 数据。 |

## 基准测试运行方式

```bash
# 运行所有基准测试
npm run bench

# 运行单个模块基准测试
npx vitest bench --config vitest.bench.config.ts -- sqlUtils
npx vitest bench --config vitest.bench.config.ts -- textUtils
npx vitest bench --config vitest.bench.config.ts -- problemMeta
```

## 基准测试覆盖范围

- **sqlUtils.bench.ts** — `splitSqlStatements`（10/100/1000 条语句、复杂 SQL、超长语句）、`isQueryStatement`、`formatRows`
- **textUtils.bench.ts** — `splitIntoChunks`（短/中/大/超大文本、极端 maxLen）、`escapeRegExp`
- **problemMeta.bench.ts** — 全链路推断函数（`inferSourceFromFile`、`inferTracksFromSource`、`inferPlatformFromSource`、`normalizeSql`、`normalizeProblemSeed` 等）

## 预算超标处理

当基准测试结果超出预算时：

1. 在 PR 中标注 `[perf-regression]` 并附上基准测试输出
2. 使用 Vitest 的 `--reporter=verbose` 获取详细分布
3. 检查是否有意外的 I/O 或内存分配引入
4. 考虑缓存、懒加载或算法优化

---

## See Also

- [性能优化 (故障排除)](troubleshooting/performance.md) -- 性能诊断方法与优化策略
- [架构文档](architecture.md) -- 系统架构与数据流设计
- [依赖审计报告](dependency-audit.md) -- 包体积与依赖分析
- [改进计划](improvement-plan.md) -- 性能相关改进项
- [术语表](glossary.md) -- 技术名词解释
