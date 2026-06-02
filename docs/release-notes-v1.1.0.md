# CodeHelper v1.1.0 Release Notes

**发布日期**: 2026-06-02  
**标签**: `v1.1.0`  
**仓库**: [TIANWEN-cpu/CodeHelper](https://github.com/TIANWEN-cpu/CodeHelper)

---

## 概述

v1.1.0 是 CodeHelper 的第一个功能增强版本，涵盖 Sprint 4-8 共五轮成熟度冲刺。本次发布聚焦于高级功能扩展、架构现代化、性能深度优化与安全加固，显著提升了应用的稳定性、可用性和开发体验。

---

## 新功能

### 命令面板 (Command Palette)

- 全局快捷键 `Ctrl+P` 调出命令面板
- 支持分类过滤标签页，快速定位功能
- 集成代码片段命令，一键插入常用代码
- 模糊搜索，输入即匹配

### 全局搜索 (Global Search)

- 跨模块全文检索（题目、知识库、代码片段）
- 搜索结果高亮显示
- 搜索历史记录，快速重复查找

### 统计仪表板 (Stats Dashboard)

- 学习数据可视化展示
- 支持设置学习目标
- 数据导出功能
- 多维度统计（按语言、难度、时间段）

### 代码片段管理 (Code Snippets)

- 用户自定义代码片段的增删改查
- 快捷插入到编辑器
- 分类管理

### 编辑器增强

- **标签页持久化** -- 编辑器标签页状态跨会话自动保存与恢复
- **分屏编辑器** -- 支持双栏对比编辑模式
- **Minimap 开关** -- 可视化控制编辑器 Minimap 显示

### 终端面板集成 (Terminal Panel)

- 内嵌终端面板，直接在应用内执行命令
- 与代码编辑器联动

### 高级架构模块

- 事件系统 -- 组件间松耦合通信
- 中间件模式 -- 可插拔的请求处理链
- 服务层抽象 -- 业务逻辑与 UI 解耦
- 插件架构 -- 支持功能扩展
- 依赖注入 -- 提升模块可测试性

### 错误处理体系

- 全局 `ErrorToast` 组件，友好的错误提示
- 各路由页面独立 `ErrorBoundary`，局部错误不扩散
- 结构化 `errorHandler.ts` 工具模块

---

## 改进

### 性能优化

| 优化领域      | 措施                                                        |
| ------------- | ----------------------------------------------------------- |
| React 渲染    | 全面使用 `memo` / `useMemo` / `useCallback`，减少不必要渲染 |
| Monaco Editor | Worker 懒加载、配置缓存、编辑器实例优化                     |
| Store         | 粒度化选择器，`shallow` 等值比较                            |
| IPC 层        | 请求去重、响应缓存、分页加载                                |
| Bundle        | 代码分割、Tree Shaking 改进                                 |
| 数据库        | PRAGMA 调优、ANALYZE、查询批处理                            |
| 启动          | Layout 视图懒加载、启动耗时插桩                             |
| 内存          | 会话清理、聊天历史裁剪、内存监控模块                        |
| 内容          | LRU 缓存、内容搜索索引、Markdown 预加载                     |

### 类型安全

- 消除所有 `any` 类型逃逸
- 定义 `AIConfigRow` / `AIConfig` / `MistakeRow` 等接口类型
- Typed IPC 层，端到端类型安全

### 代码质量

- 纯函数提取至 `electron/utils/`（`codeRunner`、`rag`、`problems`、`textUtils`）
- 共享标签映射函数提取至 `src/utils/labels.ts`
- ESLint flat config + Prettier 统一代码规范
- 删除操作增加确认对话框
- 版本号通过 `__APP_VERSION__` 动态注入

---

## 安全修复

- 完整安全审计（Sprint 7）并修复所有发现项
- Chromium 渲染进程沙箱（`contextIsolation` + `nodeIntegration: false`）
- Electron `safeStorage` API 加密存储 API 密钥
- 严格 Content-Security-Policy 头部
- 代码执行超时控制、输出大小限制、并发数限制
- 移除所有 `shell: true` 调用，防止命令注入
- IPC 参数类型检查与协议白名单校验
- 启用 Electron Fuses 安全熔丝

---

## Bug 修复

- 修复 CI 环境 `npm ci --ignore-scripts` 兼容性问题
- 修复 `sqlUtils.ts` 中 SQL 转义引号解析错误
- 修复 Sprint 5 集成中的 ESLint 警告
- 修复 `codeRunner.ts` 跨平台命令解析问题

---

## 文档

- 新增 `docs/` 完整文档体系：架构、FAQ、术语表、搜索索引、快速开始、API 参考、开发者指南、用户指南、故障排查、平台说明
- 新增 `CONTRIBUTING.md` 贡献指南
- 新增 Sprint 7 安全审计报告
- 新增 CHANGELOG 与 README badges
- 公共 API JSDoc 注释覆盖

---

## 测试

- `codeRunner.ts` 30 个测试用例，100% 行覆盖率
- `chatHelpers` 与 `dbSchema` 测试，新增 95 个用例
- Vitest 单元测试覆盖核心纯函数模块
- 覆盖率阈值门禁
- Pre-commit hooks 自动检查

---

## 工程改进

- GitHub Actions CI（lint、format check、typecheck、test）
- PR 检查工作流
- Dependabot 自动合并工作流
- React ErrorBoundary 全局错误捕获
- 知识库搜索优化为 SQL 查询
- 延迟同步避免阻塞主线程

---

## 迁移指南

从 v1.0.0 升级到 v1.1.0 **无需特殊迁移步骤**。所有变更均为向后兼容。

注意事项：

- 如果你自定义了 ESLint 配置，请注意项目已迁移至 ESLint flat config 格式
- 数据库 schema 无破坏性变更，现有数据可直接使用
- 配置文件格式无变化

---

## 已知问题

- 代码片段管理器 (SnippetManager) 的完整 CRUD 功能仍在开发中
- 部分高级分析功能（学习分析视图）尚处于早期阶段
- macOS 和 Linux 平台的键盘快捷键适配（Cmd vs Ctrl）待完善

---

## 安装

从 [GitHub Releases](https://github.com/TIANWEN-cpu/CodeHelper/releases/tag/v1.1.0) 下载对应平台的安装包：

| 平台    | 格式                          |
| ------- | ----------------------------- |
| Windows | `.exe`                        |
| macOS   | `.dmg` / `.zip`               |
| Linux   | `.AppImage` / `.deb` / `.rpm` |

---

## 致谢

感谢所有参与 Sprint 4-8 成熟度冲刺的贡献者。
