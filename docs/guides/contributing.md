# 贡献指南

> **[< 上一页: 构建与发布](deployment.md)**

欢迎为 CodeHelper 贡献代码！本文档介绍贡献流程和规范。

## 贡献流程

### 1. 准备工作

```bash
# Fork 并克隆仓库
git clone https://github.com/<your-username>/CodeHelper.git
cd CodeHelper

# 安装依赖
npm install

# 创建功能分支
git checkout -b feature/my-feature
```

### 2. 开发

- 编写代码，遵循 [日常开发指南](development.md) 中的规范
- 编写测试覆盖新增功能
- 确保所有测试通过

### 3. 提交

```bash
# 提交前自动检查（Husky + lint-staged）
git add .
git commit -m "feat(module): 描述你的改动"
```

提交信息格式：

```
<type>(<scope>): <subject>

[可选 body]

[可选 footer]
```

### 4. 推送与 PR

```bash
git push origin feature/my-feature
```

在 GitHub 上创建 Pull Request，填写：

- 改动说明
- 测试方式
- 关联的 Issue（如有）

### 5. 代码审查

PR 需要通过：

- CI 自动检查（类型检查、Lint、测试）
- 至少一位维护者的 Code Review

## 代码规范

### TypeScript

- 使用 `strict` 模式
- 优先使用 `interface` 而非 `type` 定义对象类型
- 使用 `unknown` 而非 `any`
- 导出类型时使用 `export type`

### React

- 使用函数组件 + Hooks
- 组件文件使用 `.tsx` 扩展名
- 使用 `React.memo` 避免不必要的重渲染
- 使用 `useCallback` / `useMemo` 优化性能

### Store

- 使用 `typedInvoke` 而非直接调用 `window.api.invoke`
- 异步操作统一使用 `toErrorMessage()` 处理错误
- Store 文件中重导出类型以保持向后兼容

### 样式

- 使用 Tailwind CSS 原子化类名
- 使用 CSS 变量引用主题颜色（`var(--theme-xxx)`）
- 避免内联样式

### 测试

- 每个新增功能应有对应的测试
- 测试文件放在 `tests/` 目录下
- 文件命名：`<module>.test.ts`
- 使用 AAA 模式（Arrange、Act、Assert）

## 提交规范

### 类型

| 类型       | 说明                   |
| ---------- | ---------------------- |
| `feat`     | 新功能                 |
| `fix`      | 修复 Bug               |
| `refactor` | 重构（不改变功能）     |
| `docs`     | 文档                   |
| `style`    | 格式调整（不影响功能） |
| `test`     | 测试                   |
| `chore`    | 构建/配置/工具         |
| `perf`     | 性能优化               |

### 范围

使用模块名称：`problems`、`editor`、`ai-chat`、`knowledge`、`mistakes`、`settings`、`stats`、`search`、`db`、`ipc`、`store` 等。

### 示例

```
feat(problems): 添加题目收藏功能
fix(chat): 修复流式响应乱序问题
refactor(stores): 提取共享的错误处理逻辑
docs: 更新快速上手指南
test(problems): 添加题目筛选测试
perf(db): 优化查询性能，添加索引
```

## Issue 规范

### Bug 报告

```
## 描述
[清晰描述 Bug]

## 复现步骤
1. 打开 ...
2. 点击 ...
3. 看到错误 ...

## 期望行为
[描述期望的正确行为]

## 环境
- OS: Windows 11
- Node.js: 20.x
- CodeHelper 版本: 1.0.0
```

### 功能请求

```
## 描述
[清晰描述需求]

## 使用场景
[描述为什么需要这个功能]

## 建议实现方式
[如有想法，描述实现方案]
```

## 项目维护

### 发布流程

1. 更新 `CHANGELOG.md`
2. 运行 `npm run release:patch/minor/major`
3. 推送标签触发 CI 自动发布

### 依赖更新

```bash
# 检查过期依赖
npm outdated

# 更新依赖
npm update

# 更新主要版本（谨慎）
npm install package@latest
```

### 分支保护

`main` 分支设置了保护规则：

- 需要 PR 才能合并
- 需要 CI 通过
- 需要至少 1 个 Code Review 批准

---

## See Also

- [快速上手](getting-started.md) -- 环境搭建与首次运行
- [日常开发指南](development.md) -- 代码规范与 Git 工作流
- [测试指南](testing.md) -- 测试编写与覆盖率要求
- [构建与发布](deployment.md) -- 构建流程与版本管理
- [CONTRIBUTING.md](../../CONTRIBUTING.md) -- 根目录贡献指南（更详细）
- [IPC 通信模式](../concepts/ipc-patterns.md) -- 新增 IPC 通道的步骤
- [架构文档](../architecture.md) -- 系统架构与模块设计
- [术语表](../glossary.md) -- 技术名词解释
