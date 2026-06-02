# 贡献指南

感谢你对 CodeHelper 的关注！本文档将帮助你快速上手项目开发。

## 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [项目架构](#项目架构)
- [开发工作流](#开发工作流)
- [新增功能指南](#新增功能指南)
- [调试技巧](#调试技巧)
- [代码规范](#代码规范)
- [测试要求](#测试要求)
- [分支与提交规范](#分支与提交规范)
- [Pull Request 流程](#pull-request-流程)

---

## 环境要求

| 工具     | 版本要求                | 说明              |
| -------- | ----------------------- | ----------------- |
| Node.js  | >= 18                   | 推荐使用 LTS 版本 |
| npm      | >= 9                    | 随 Node.js 安装   |
| Git      | >= 2.30                 | 版本管理          |
| 操作系统 | Windows / macOS / Linux | 均可开发          |

### 可选依赖（代码运行器功能）

| 语言       | 依赖                   | 安装说明                                                                      |
| ---------- | ---------------------- | ----------------------------------------------------------------------------- |
| Python     | `python` >= 3.8        | [python.org](https://www.python.org/downloads/)                               |
| C / C++    | `gcc` / `g++`          | Windows: MinGW-w64; macOS: `xcode-select --install`; Linux: `build-essential` |
| Java       | `javac` / `java` >= 11 | [Adoptium](https://adoptium.net/)                                             |
| C#         | `dotnet` >= 6          | [dotnet.microsoft.com](https://dotnet.microsoft.com/download)                 |
| JavaScript | `node`                 | 已随 Node.js 安装                                                             |

> 未安装对应编译器的语言仍可正常使用其他功能，仅代码运行器会提示找不到命令。

### 推荐 IDE 配置

[VS Code](https://code.visualstudio.com/) + 以下扩展：

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)

---

## 快速开始

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/<你的用户名>/CodeHelper.git
cd CodeHelper

# 2. 安装依赖
npm install

# 3. 启动开发服务器（热重载）
npm run dev

# 4. 验证一切正常
npm run typecheck
npm run lint
npm test
```

启动后 Electron 窗口将自动打开，修改代码后会自动刷新。

---

## 项目架构

CodeHelper 采用 Electron + React + TypeScript 的三进程模型。详细架构说明请参阅 [architecture.md](architecture.md)。

### 关键文件

| 文件/目录             | 说明                             |
| --------------------- | -------------------------------- |
| `electron/main.ts`    | 应用入口，窗口管理，IPC 路由注册 |
| `electron/preload.ts` | 安全桥接，IPC 白名单             |
| `electron/ipc/`       | 所有 IPC 业务处理器              |
| `electron/utils/`     | 纯函数工具模块                   |
| `electron/db/`        | 数据库连接与 Schema              |
| `src/App.tsx`         | React 根组件                     |
| `src/components/`     | 通用组件（Sidebar, Layout 等）   |
| `src/modules/`        | 功能模块（每个模块独立目录）     |
| `src/stores/`         | Zustand 状态管理                 |
| `src/api/ipc.ts`      | 前端 IPC 调用封装                |
| `tests/`              | 单元测试                         |

### 数据流

```
用户操作 → React 组件 → Zustand Store → typedInvoke(channel, args)
    → preload (白名单 + 序列化校验) → IPC handler (参数校验 + 业务逻辑)
    → SQLite / 子进程 / HTTP 请求
    → 返回结果 → 更新 Store → UI 刷新
```

---

## 开发工作流

### 常用命令

```bash
# 开发
npm run dev              # 启动开发服务器（热重载）
npm run build            # 构建生产版本
npm run build:win        # 构建 Windows 安装包

# 质量检查
npm run typecheck        # TypeScript 类型检查
npm run lint             # ESLint 检查
npm run lint:fix         # ESLint 自动修复
npm run format           # Prettier 格式化
npm run format:check     # Prettier 格式检查

# 测试
npm test                 # 运行所有测试（单次）
npm run test:watch       # 监听模式（开发时推荐）
npm run test:ui          # 可视化测试界面
npm run test:coverage    # 生成覆盖率报告
```

### 提交前检查清单

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

---

## 新增功能指南

### 添加新的 IPC Channel

1. **定义常量**：在 `src/constants/index.ts` 的 `IPC` 对象中添加 channel 名称
2. **注册处理器**：在 `electron/ipc/` 对应文件中添加 `ipcMain.handle(channel, handler)`
3. **更新白名单**：在 `electron/preload.ts` 的 `allowedInvokeChannels` 中添加 channel
4. **创建类型**：在 `src/types/ipc.ts` 的 `IpcChannelMap` 中添加参数和返回值类型
5. **前端调用**：在 store 中使用 `typedInvoke(channel, ...args)` 调用
6. **编写测试**：为 IPC handler 和前端调用编写单元测试

### 添加新的页面/模块

1. 在 `src/modules/` 下创建新目录（如 `src/modules/mymodule/`）
2. 实现页面组件（主视图 + 子组件）
3. 在 `src/stores/` 中创建对应的 Zustand store（如需要）
4. 在 `src/constants/index.ts` 中添加模块 ID
5. 在 `src/components/Sidebar.tsx` 的 `SIDEBAR_NAV_ITEMS` 中添加导航入口
6. 在 `src/components/Layout.tsx` 中添加路由映射
7. 在 `SIDEBAR_NAV_ITEMS` 数组中定义图标和标签

### 添加新的数据库表

1. 在 `electron/db/schema.sql` 中添加 `CREATE TABLE` 语句
2. 在 `electron/types/db.ts` 中添加行类型定义
3. 在对应的 IPC handler 中添加 CRUD 操作
4. 如需索引，在 schema.sql 中添加 `CREATE INDEX` 语句

---

## 调试技巧

详细调试说明请参阅 [debugging.md](debugging.md)。

### 快速参考

| 调试目标      | 方法                                          |
| ------------- | --------------------------------------------- |
| Main 进程     | 查看运行 `npm run dev` 的终端输出             |
| Renderer 进程 | `Ctrl+Shift+I` 打开 DevTools                  |
| IPC 通信      | 在 preload.ts 的 invoke 中添加 console.log    |
| 数据库        | 使用 DB Browser for SQLite 打开 db 文件       |
| 性能问题      | 查看 Main 进程的性能监控日志（每 5 分钟输出） |

---

## 代码规范

### 关键规则

- TypeScript 严格模式（`strict: true`）
- 使用单引号、无分号（Prettier 配置）
- 行宽限制 100 字符
- 未使用变量以 `_` 前缀命名可免警告
- React Hooks 规则强制执行
- `no-explicit-any` 为警告级别

### 格式化

```bash
npm run format     # 手动格式化
```

提交代码时，pre-commit hooks（Husky + lint-staged）会自动格式化。

---

## 测试要求

项目使用 [Vitest](https://vitest.dev/) 进行单元测试。

### 覆盖率要求

| 指标       | 最低阈值 |
| ---------- | -------- |
| Statements | 80%      |
| Branches   | 70%      |
| Functions  | 80%      |
| Lines      | 80%      |

### 测试文件约定

- 测试文件放在 `tests/` 目录下
- 文件名格式：`<模块名>.test.ts`
- 测试覆盖范围：`src/utils/`、`src/stores/`、`src/constants/`、`src/api/`、`electron/utils/`、`electron/db/`、`electron/ipc/`

### 编写测试

```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from '../src/utils/example'

describe('myFunction', () => {
  it('应该在参数为空时返回默认值', () => {
    expect(myFunction('')).toBe('default')
  })

  it('应该正确处理正常输入', () => {
    expect(myFunction('hello')).toBe('HELLO')
  })
})
```

### 测试命名规范

- 使用中文描述测试场景
- 使用 `describe` 按功能分组
- 每个 `it` 只测试一个行为

---

## 分支与提交规范

### 分支策略

| 分支       | 用途         |
| ---------- | ------------ |
| `main`     | 稳定发布分支 |
| `dev`      | 开发集成分支 |
| `feat/xxx` | 功能开发     |
| `fix/xxx`  | Bug 修复     |
| `docs/xxx` | 文档更新     |

### Commit 规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>
```

示例：

```
feat(problems): 新增数学建模题库导入
fix(rag): 修复文档分块越界问题
docs(readme): 补充开发环境说明
refactor(ipc): 提取判题逻辑到 service 层
test(chat): 添加聊天会话创建测试
chore(deps): 升级 electron 到 v41
```

常用 type：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`

---

## Pull Request 流程

1. Fork 仓库并从 `dev` 分支创建功能分支
2. 完成开发后确保所有检查通过
3. 推送分支并创建 Pull Request
4. 在 PR 描述中说明：
   - 改动的目的和背景
   - 具体的改动内容
   - 测试情况（新增/修改了哪些测试）
5. 等待 Code Review 通过后合并

### PR 检查项

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 无错误
- [ ] `npm run format:check` 通过
- [ ] `npm test` 全部通过
- [ ] 新增代码有对应测试（如适用）
- [ ] 无硬编码的 API Key 或敏感信息

---

如有其他问题，欢迎在 [GitHub Issues](https://github.com/TIANWEN-cpu/CodeHelper/issues) 中提问。

---

## See Also

- [贡献指南 (guides)](../guides/contributing.md) -- docs 目录下的贡献指南
- [快速上手](../guides/getting-started.md) -- 环境搭建与首次运行
- [日常开发指南](../guides/development.md) -- 代码规范与 Git 工作流
- [CONTRIBUTING.md](../../CONTRIBUTING.md) -- 根目录贡献指南
- [术语表](../glossary.md) -- 技术名词解释
