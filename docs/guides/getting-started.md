# 快速上手

> **[下一页: 日常开发指南 >](development.md)**

本指南帮助你在本地快速搭建 CodeHelper 开发环境并运行项目。

## 环境要求

| 依赖    | 最低版本 | 推荐版本 | 说明                        |
| ------- | -------- | -------- | --------------------------- |
| Node.js | 18.x     | 20.x LTS | JavaScript 运行时           |
| npm     | 9.x      | 10.x     | 包管理器（随 Node.js 安装） |
| Git     | 2.x      | 最新     | 版本控制                    |
| Python  | 3.9+     | 3.11+    | 代码执行功能需要            |
| GCC/G++ | 任意     | 最新     | C/C++ 代码执行需要（可选）  |

### 可选工具

- **C# 编译器** (csc)：运行 C# 代码需要
- **VS Code**：推荐的 IDE，支持 Electron 调试
- **Windows Build Tools**：`npm install -g windows-build-tools`（编译 native 模块需要）

## 获取代码

```bash
# 克隆仓库
git clone https://github.com/TIANWEN-cpu/CodeHelper.git
cd CodeHelper
```

## 安装依赖

```bash
# 安装 npm 依赖
npm install

# 安装 Electron 的 native 模块依赖
npm run postinstall
```

> 如果 `npm install` 时出现 native 模块编译错误，请确认已安装 Python 和 C++ 构建工具。

## 启动开发服务器

```bash
# 启动 Electron 开发模式（同时启动 Vite 热更新和 Electron 主进程）
npm run dev
```

启动后会自动打开应用窗口。修改 `src/` 下的文件会自动热更新渲染进程；修改 `electron/` 下的文件需要重启。

## 项目结构概览

```
D:\codehelper\
├── electron/           # 主进程代码（Node.js 环境）
│   ├── main.ts         # 应用入口
│   ├── preload.ts      # 安全桥接
│   ├── db/             # 数据库
│   ├── ipc/            # IPC 处理器
│   └── utils/          # 工具函数
├── src/                # 渲染进程代码（浏览器环境）
│   ├── components/     # 通用组件
│   ├── modules/        # 功能模块
│   ├── stores/         # Zustand 状态管理
│   ├── hooks/          # React Hooks
│   ├── types/          # TypeScript 类型
│   └── utils/          # 工具函数
├── tests/              # 测试文件
├── docs/               # 文档（当前目录）
└── resources/          # 打包资源
```

## 首次配置

### 1. 配置 AI 模型

CodeHelper 的 AI 助手功能需要配置 AI 模型 API：

1. 启动应用后，点击侧栏底部的 **设置** 图标
2. 在 AI 配置区域，点击"添加配置"
3. 填写以下信息：
   - **名称**：配置名称（如 "GPT-4o"）
   - **API Key**：你的 API 密钥
   - **Base URL**：API 地址（默认 `https://api.openai.com/v1`）
   - **模型**：模型名称（如 `gpt-4o`）
4. 点击保存

### 2. 配置代码执行环境

代码运行功能依赖本地安装的编程语言运行时：

| 语言   | 需要安装                 |
| ------ | ------------------------ |
| Python | `python` 命令在 PATH 中  |
| C      | `gcc` 命令在 PATH 中     |
| C++    | `g++` 命令在 PATH 中     |
| C#     | `csc` 命令在 PATH 中     |
| SQLite | 内置支持（无需额外安装） |

## 常用开发命令

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 构建并打包（Windows）
npm run build:win

# 构建并打包（macOS）
npm run build:mac

# 构建并打包（Linux）
npm run build:linux

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 代码检查并自动修复
npm run lint:fix

# 格式化代码
npm run format

# 检查格式
npm run format:check

# 运行测试
npm run test

# 监视模式运行测试
npm run test:watch

# 带 UI 的测试
npm run test:ui

# 测试覆盖率
npm run test:coverage

# 性能基准测试
npm run bench
```

## 快速验证

运行以下命令确认环境正常：

```bash
# 1. 类型检查（应无错误）
npm run typecheck

# 2. 代码检查（应无错误）
npm run lint

# 3. 运行测试（应全部通过）
npm run test

# 4. 启动应用（应能看到窗口）
npm run dev
```

## 下一步

- 阅读 [日常开发指南](development.md) 了解分支策略和 Git 工作流
- 阅读 [测试指南](testing.md) 了解如何编写和运行测试
- 阅读 [系统架构](../concepts/architecture.md) 深入理解项目设计

---

## See Also

- [日常开发指南](development.md) -- 分支策略、代码规范与 Git 工作流
- [测试指南](testing.md) -- 测试编写与运行
- [调试指南](debugging.md) -- 主进程与渲染进程调试技巧
- [系统架构](../concepts/architecture.md) -- 深入理解项目设计
- [IPC 通信模式](../concepts/ipc-patterns.md) -- 理解主进程与渲染进程通信
- [快速入门 (docs/)](../quickstart.md) -- 5 分钟从安装到完成第一道题
- [故障排除](../troubleshooting.md) -- 常见问题与解决方案
- [CONTRIBUTING.md](../../CONTRIBUTING.md) -- 完整贡献指南
