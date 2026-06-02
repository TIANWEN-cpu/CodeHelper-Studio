# 贡献指南

感谢你对 CodeHelper 的关注！本文档将帮助你快速上手项目开发。

## 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [项目架构](#项目架构)
- [开发工作流](#开发工作流)
- [调试技巧](#调试技巧)
- [新增功能指南](#新增功能指南)
- [代码规范](#代码规范)
- [分支与提交规范](#分支与提交规范)
- [Pull Request 流程](#pull-request-流程)
- [常见问题](#常见问题)

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

### 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + 以下扩展：
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - TypeScript Vue Plugin (Volar) -- 提供更好的 TS 体验

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

CodeHelper 采用 **Electron + React + TypeScript** 的三进程模型：

```
┌──────────────────────────────────────────────────────────────┐
│  Main Process (electron/)                                    │
│  ├─ main.ts          应用入口、窗口管理、生命周期              │
│  ├─ preload.ts       安全桥接、IPC 白名单校验                 │
│  ├─ ipc/             IPC 处理器（业务逻辑入口）                │
│  │   ├─ ai.ts        AI 对话（流式响应）                       │
│  │   ├─ chat.ts      聊天会话 + 预设提示词 + 长期记忆          │
│  │   ├─ database.ts  设置 + AI 配置管理                       │
│  │   ├─ mistakes.ts  错题本管理                               │
│  │   ├─ problems.ts  题库管理 + 自动判题                       │
│  │   ├─ rag.ts       知识库 RAG 引擎                          │
│  │   └─ runner.ts    代码执行入口                             │
│  ├─ utils/           纯函数工具模块                            │
│  └─ db/              SQLite 数据库连接与 Schema               │
├──────────────────────────────────────────────────────────────┤
│  Renderer Process (src/)                                     │
│  ├─ App.tsx           应用根组件                              │
│  ├─ components/       通用组件（Sidebar, Layout, StatusBar）  │
│  ├─ modules/          功能模块（editor, problems, ai-chat…）  │
│  ├─ stores/           Zustand 状态管理                        │
│  ├─ types/            共享 TypeScript 类型定义                 │
│  ├─ constants/        共享常量（IPC 通道名、默认值等）          │
│  └─ utils/            前端工具函数                             │
└──────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户操作 → React 组件
         → Zustand Store (状态管理)
         → window.api.invoke(channel, args)  (类型安全的 IPC 调用)
         → preload.ts (白名单校验 + 序列化检查)
         → electron/ipc/*.ts (参数校验 + 业务逻辑)
         → electron/db/ (SQLite 数据库)
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
npm run format:check     # Prettier 格式检查（CI 用）

# 测试
npm test                 # 运行所有测试（单次）
npm run test:watch       # 监听模式（开发时自动重跑）
npm run test:ui          # 可视化测试界面
npm run test:coverage    # 运行测试并生成覆盖率报告
```

### 提交前检查清单

在提交代码前，请确保以下命令全部通过：

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

如果安装了 pre-commit hooks（`npm install` 后自动启用），提交时会自动执行 lint-staged 检查。

---

## 调试技巧

### Main 进程调试

Main 进程的 `console.log` 输出会出现在启动 `npm run dev` 的终端中。

如需更详细的调试：

```bash
# 启用 Electron 的 verbose 日志
ELECTRON_ENABLE_LOGGING=1 npm run dev
```

在 `electron/` 代码中使用 `console.log`、`console.warn`、`console.error` 即可。

### Renderer 进程调试

开发模式下按 `Ctrl+Shift+I`（Windows/Linux）或 `Cmd+Option+I`（macOS）打开 Chrome DevTools。

也可以在代码中添加 `debugger` 语句，DevTools 打开时会自动断点。

### IPC 日志调试

在 `electron/preload.ts` 的 `invoke` 函数中临时添加日志：

```typescript
invoke: (channel: string, ...args: unknown[]) => {
  console.log('[IPC invoke]', channel, args) // 临时调试
  // ...原有逻辑
}
```

### 数据库调试

SQLite 数据库文件位于：

- Windows: `%APPDATA%/codehelper/database.db`
- macOS: `~/Library/Application Support/codehelper/database.db`
- Linux: `~/.config/codehelper/database.db`

可以使用 [DB Browser for SQLite](https://sqlitebrowser.org/) 打开查看。

---

## 新增功能指南

### 添加新的 IPC Channel

1. **定义常量**：在 `src/constants/index.ts` 的 `IPC` 对象中添加 channel 名称
2. **注册处理器**：在 `electron/ipc/` 对应文件中添加 `ipcMain.handle(channel, handler)`
3. **更新白名单**：在 `electron/preload.ts` 的 `allowedInvokeChannels` 中添加 channel
4. **创建类型**：在 `src/types/ipc.ts` 的 `IpcChannelMap` 中添加参数和返回值类型
5. **前端调用**：在 store 中使用 `typedInvoke(channel, ...args)` 调用

### 添加新的页面/模块

1. 在 `src/modules/` 下创建新目录
2. 实现页面组件
3. 在 `src/stores/` 中创建对应的 Zustand store（如需要）
4. 在 `src/constants/index.ts` 中添加模块 ID
5. 在 `src/components/Sidebar.tsx` 中添加导航入口
6. 在 `src/components/Layout.tsx` 中添加路由映射

---

## 代码规范

项目使用 **ESLint + Prettier** 进行代码质量与格式管理。

### 关键规则

- TypeScript 严格模式（`strict: true`）
- 使用单引号、无分号（Prettier 配置）
- 行宽限制 100 字符
- 未使用变量以 `_` 前缀命名可免警告
- React Hooks 规则强制执行
- `no-explicit-any` 为警告级别

### 格式化

提交代码时，pre-commit hooks 会自动格式化。手动格式化：

```bash
npm run format
```

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
2. 完成开发后确保所有检查通过：
   ```bash
   npm run typecheck && npm run lint && npm run format:check && npm test
   ```
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

## 常见问题

### Q: `npm install` 报错 `better-sqlite3` 编译失败

`better-sqlite3` 是原生模块，需要编译工具链：

- **Windows**: 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，选择"使用 C++ 的桌面开发"工作负载
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`

### Q: 代码运行器提示"找不到命令"

确保对应语言的编译器/运行时已安装并在 PATH 中。详见[环境要求](#环境要求)中的可选依赖表。

### Q: Electron 窗口白屏

1. 检查终端是否有编译错误
2. 尝试删除 `node_modules` 和 `out` 目录后重新安装：`rm -rf node_modules out && npm install`
3. 确认 Node.js 版本 >= 18

### Q: 类型检查通过但运行时报错

可能是 IPC 调用的返回值类型不匹配。检查 `src/types/ipc.ts` 中的 `IpcChannelMap` 是否与 `electron/ipc/*.ts` 中的 handler 返回值一致。

### Q: 如何查看 IPC 通信日志？

在 `electron/main.ts` 中添加：

```typescript
// 在 app.whenReady() 之前
ipcMain.on('*', (event, ...args) => {
  console.log('[IPC]', event.sender.id, ...args)
})
```

注意：这只能捕获 `ipcMain.on` 注册的事件，`ipcMain.handle` 需要在各 handler 中单独添加日志。

---

如有其他问题，欢迎在 [GitHub Issues](https://github.com/TIANWEN-cpu/CodeHelper/issues) 中提问。
