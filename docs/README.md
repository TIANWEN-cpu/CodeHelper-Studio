# CodeHelper 文档中心

欢迎查阅 CodeHelper 项目的完整技术文档。本文档涵盖架构设计、开发指南、API 参考以及常见问题排查。

## 目录导航

### 概念文档

深入理解 CodeHelper 的设计理念与技术架构。

| 文档                                     | 说明                                 |
| ---------------------------------------- | ------------------------------------ |
| [系统架构](concepts/architecture.md)     | 整体架构、技术栈、目录结构与模块划分 |
| [IPC 通信模式](concepts/ipc-patterns.md) | Electron 主进程与渲染进程的通信机制  |
| [安全模型](concepts/security-model.md)   | 安全策略、API Key 加密、CSP 配置     |
| [状态管理](concepts/state-management.md) | Zustand 状态管理模式与最佳实践       |
| [数据流](concepts/data-flow.md)          | 数据从用户操作到持久化的完整流转路径 |

### 用户操作与数据安全

面向日常使用、迁移和故障恢复的操作文档。

| 文档                                               | 说明                                      |
| -------------------------------------------------- | ----------------------------------------- |
| [设置指南](user-guide/settings-guide.md)           | 账户、外观、AI、记忆、数据与能力状态入口  |
| [数据可移植性](data-portability.md)                | SQLite、JSON 子集和 localStorage 恢复边界 |
| [备份与恢复手册](guides/backup-restore-runbook.md) | 完整 userData 备份与人工恢复              |
| [发布回滚手册](guides/rollback-runbook.md)         | 已公开版本事故的可执行处置                |
| [安全审计报告](security-audit.md)                  | 当前威胁模型、开放发现和残余风险          |
| [依赖审计报告](dependency-audit.md)                | 生产与构建依赖的分层审计                  |

### 开发指南

面向开发者的一站式工作流指引。

| 文档                                               | 说明                           |
| -------------------------------------------------- | ------------------------------ |
| [快速上手](guides/getting-started.md)              | 环境准备、首次克隆与运行       |
| [日常开发](guides/development.md)                  | 分支策略、代码风格、Git 工作流 |
| [测试指南](guides/testing.md)                      | 单元测试、集成测试与覆盖率     |
| [调试指南](guides/debugging.md)                    | 主进程/渲染进程调试技巧        |
| [构建与发布](guides/deployment.md)                 | Windows 打包、签名与发布门禁   |
| [发布与回滚清单](guides/release-checklist.md)      | 正式发布证据与发布后校验       |
| [备份与恢复手册](guides/backup-restore-runbook.md) | 用户数据保护和恢复验证         |
| [发布回滚手册](guides/rollback-runbook.md)         | 已公开版本事故响应             |
| [贡献指南](guides/contributing.md)                 | PR 规范、代码审查与发布流程    |

### API 参考

精确到每个通道、每张表、每个组件的技术参考。

| 文档                                          | 说明                        |
| --------------------------------------------- | --------------------------- |
| [IPC 通道一览](reference/ipc-channels.md)     | 所有 IPC 通道的参数与返回值 |
| [数据库 Schema](reference/database-schema.md) | SQLite 表结构、索引与约束   |
| [外部 API](reference/api-endpoints.md)        | AI 模型 API 调用方式        |
| [React 组件](reference/components.md)         | 组件树、Props 与使用示例    |
| [Zustand Stores](reference/stores.md)         | 各 Store 状态字段与 Actions |
| [工具函数](reference/utils.md)                | 通用工具函数参考            |

### 架构决策记录 (ADR)

记录关键技术选型的背景与权衡。

| 文档                                     | 决策                               |
| ---------------------------------------- | ---------------------------------- |
| [ADR-001](adr/001-electron-choice.md)    | 选择 Electron 作为桌面框架         |
| [ADR-002](adr/002-zustand-over-redux.md) | 选择 Zustand 而非 Redux            |
| [ADR-003](adr/003-sqlite-choice.md)      | 选择 better-sqlite3 作为本地数据库 |

### 问题排查

快速定位并解决常见问题。

| 文档                                         | 说明                 |
| -------------------------------------------- | -------------------- |
| [常见问题](troubleshooting/common-issues.md) | 日常开发中的高频问题 |
| [构建问题](troubleshooting/build-issues.md)  | 构建与打包相关故障   |
| [性能优化](troubleshooting/performance.md)   | 性能诊断与优化策略   |

---

## 技术栈概览

```
前端框架:  React 19 + TypeScript 6
状态管理:  Zustand 5
代码编辑:  CodeMirror 6 (@uiw/react-codemirror)
桌面框架:  Electron 41
构建工具:  electron-vite 5 + Vite 7
本地数据库: better-sqlite3
CSS 方案:  Tailwind CSS 4
测试框架:  Vitest 4
代码规范:  ESLint 9 + Prettier 3
CI/CD:    GitHub Actions
```

## 文档约定

- 所有文档使用中文撰写
- 代码示例使用 TypeScript
- 文件路径相对于项目根目录 `D:\codehelper`
- IPC 通道名称使用 kebab-case
- Store 名称使用 camelCase 并以 `use` 前缀导出

---

## See Also

- [README.md](../README.md) -- 项目概览、功能特性与安装指南
- [CONTRIBUTING.md](../CONTRIBUTING.md) -- 贡献指南（分支策略、PR 流程）
- [FAQ](faq.md) -- 常见问题解答
- [glossary.md](glossary.md) -- 技术术语速查
- [search-index.md](search-index.md) -- 按关键词快速定位文档
