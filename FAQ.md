# 常见问题 (FAQ)

## 基础问题

### Q: CodeHelper 是什么？

CodeHelper 是一款 AI 驱动的桌面编程助手，基于 Electron + React + TypeScript 构建。它集成了代码编辑器、AI 对话、题库系统、知识库检索与错题追踪五大核心功能，旨在帮助编程学习者高效学习和练习编程。

### Q: CodeHelper 支持哪些操作系统？

支持 Windows、macOS 和 Linux 三个平台。

### Q: CodeHelper 是免费的吗？

是的，CodeHelper 是基于 MIT License 开源的免费软件。但 AI 对话功能需要你自己提供 OpenAI 兼容的 API 服务，这可能产生费用。

### Q: CodeHelper 需要联网使用吗？

- **基本功能（编辑器、题库、代码运行器、错题本）**：完全离线可用
- **AI 对话功能**：需要网络连接到 API 服务
- **知识库**：本地存储，离线可用

---

## 安装与环境

### Q: npm install 报错 better-sqlite3 编译失败怎么办？

`better-sqlite3` 是原生模块，需要 C++ 编译工具链：

- **Windows**: 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，选择"使用 C++ 的桌面开发"工作负载
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`

安装后执行 `rm -rf node_modules && npm install` 重新编译。

### Q: 需要安装哪些编程语言的编译器？

代码运行器功能是可选的，不影响其他功能使用：

| 语言       | 需要安装            |
| ---------- | ------------------- |
| Python     | Python >= 3.8       |
| C          | gcc（MinGW-w64 等） |
| C++        | g++（同 gcc）       |
| C#         | .NET SDK >= 6       |
| Java       | JDK >= 11           |
| JavaScript | Node.js（已自带）   |
| SQL        | 无需额外安装        |

### Q: 如何更新 CodeHelper？

从源码运行的用户：

```bash
git pull
npm install
npm run dev
```

使用安装包的用户：从 GitHub Releases 下载最新版本安装即可。

---

## AI 功能

### Q: 如何配置 AI 服务？

进入设置模块，添加 AI 配置：

1. 填写名称、API Key、Base URL 和模型名称
2. 点击保存
3. 详细步骤参见 [快速开始 - API 配置](docs/user-guide/getting-started.md#api-配置)

### Q: 支持哪些 AI 服务？

支持所有兼容 OpenAI API 格式的服务，包括但不限于：

- OpenAI（GPT-4o、GPT-4o-mini 等）
- DeepSeek
- 本地 Ollama（`http://localhost:11434/v1`）
- 其他 OpenAI 兼容服务

### Q: 如何使用本地 AI 模型（如 Ollama）？

1. 安装并启动 Ollama：`ollama serve`
2. 下载模型：`ollama pull llama3`
3. 在 CodeHelper 设置中添加配置：
   - Base URL: `http://localhost:11434/v1`
   - Model: `llama3`（或你下载的模型名）
   - API Key: 任意值（Ollama 不验证）

### Q: AI 对话为什么没有响应？

排查步骤：

1. 检查设置中是否已配置 AI 模型
2. 确认 API Key 有效且有足够额度
3. 确认 Base URL 正确（不含 `/chat/completions`）
4. 检查网络连接（部分服务可能需要代理）

### Q: API Key 存储安全吗？

API Key 使用 Electron 的 `safeStorage` API 进行操作系统级加密后存储，不会以明文形式出现在数据库中。

### Q: AI 的长期记忆是什么？

长期记忆系统允许 AI 跨会话记住你的偏好和重要信息。记忆会根据对话内容自动提取，也可以手动添加。AI 在对话时会自动检索相关记忆并注入上下文。

---

## 题库系统

### Q: 有多少道题目？

当前内置 158+ 道题目，覆盖：

- 基础练习：48 道
- 力扣经典：80 道
- 数学建模：30 道

### Q: 支持哪些编程语言？

支持 Python、C、C++、C#、JavaScript 和 SQL 六种语言。

### Q: SQL 题目怎么运行？

SQL 题目使用内置的内存 SQLite 数据库执行，无需外接数据库。代码中可以包含多条语句，最后一条如果是 SELECT 查询，其结果作为输出。

### Q: 判题结果准确吗？

判题引擎对输出进行规范化比较（去除首尾空白、统一换行符等）。SQL 题目还会标准化 SQL 格式后比较。对于需要精确输出匹配的题目，建议严格按照示例格式输出。

### Q: 如何添加自定义题目？

在 `resources/problems/` 目录下创建 JSON 文件，格式参考现有的 `basic.json`。重启应用后自动同步到数据库。

---

## 知识库

### Q: 支持哪些文件格式？

支持 `.txt`、`.md` 和 `.pdf` 三种格式，单文件最大 10MB。

### Q: PDF 文件无法导入怎么办？

- 确认 PDF 文件未加密
- 确认文件大小不超过 10MB
- 尝试将 PDF 内容复制到 `.txt` 文件中导入

### Q: 检索结果不准确怎么办？

当前使用关键词匹配检索，建议：

- 使用多个相关关键词（空格分隔）
- 使用更具体的关键词
- 避免使用过于常见的词汇

---

## 编辑器

### Q: 如何运行编辑器中的代码？

在编辑器中编写代码后，点击运行按钮或使用快捷键执行。运行结果显示在下方的控制台面板中。

### Q: 代码运行超时怎么办？

代码运行器有 10 秒超时限制。如果代码需要长时间运行：

- 检查是否有死循环
- 优化算法效率
- 对于确实需要长时间运行的代码，建议在本地终端运行

### Q: Monaco Editor 和 VS Code 有什么关系？

Monaco Editor 是 VS Code 的核心编辑器组件，CodeHelper 直接使用了这个编辑器引擎，因此提供与 VS Code 相同的编辑体验，包括语法高亮、智能补全、代码折叠等功能。

---

## 错题本

### Q: 错题是怎么收集的？

每次在题库系统中提交代码被判为失败（答案错误、编译错误、运行时错误、超时），系统会自动将该题目添加到错题本中。

### Q: 同一道题多次做错会怎样？

错题本会累加错误次数，并记录所有出现过的错误类型。最新一次的错误代码会覆盖之前的记录。

### Q: 做对了错题本会更新吗？

是的，当你通过之前做错的题目时，你的正确代码会自动保存到错题本中，方便对比学习。

---

## 设置与配置

### Q: 数据存储在哪里？

SQLite 数据库文件位置：

- Windows: `%APPDATA%/codehelper/codehelper.db`
- macOS: `~/Library/Application Support/codehelper/codehelper.db`
- Linux: `~/.config/codehelper/codehelper.db`

### Q: 如何备份数据？

复制上述数据库文件即可完成完整备份，包括所有题目提交记录、聊天历史、知识库、错题本和设置。

### Q: 如何重置应用？

删除数据库文件后重启应用即可完全重置。注意：这会清除所有数据。

### Q: 有哪些主题可选？

内置三套主题：

- **Catppuccin Mocha**（默认）- 深色主题
- **Fjord** - 北欧峡湾风格暗色主题
- **Ember** - 暖色调暗色主题

---

## 开发相关

### Q: 如何参与 CodeHelper 开发？

参阅 [贡献指南](docs/developer-guide/contributing.md)，基本流程：

1. Fork 仓库
2. 克隆并安装依赖
3. 创建功能分支
4. 开发并测试
5. 提交 Pull Request

### Q: 如何报告 Bug？

在 [GitHub Issues](https://github.com/TIANWEN-cpu/CodeHelper/issues) 中使用 Bug 报告模板提交，包含：

- 问题描述
- 复现步骤
- 环境信息
- 错误日志

### Q: 如何请求新功能？

在 [GitHub Issues](https://github.com/TIANWEN-cpu/CodeHelper/issues) 中使用功能请求模板提交，包含：

- 功能描述
- 使用场景
- 期望的交互方式

### Q: 项目的许可证是什么？

CodeHelper 基于 [MIT License](https://github.com/TIANWEN-cpu/CodeHelper/blob/main/LICENSE) 开源。

---

## See Also

- [README.md](README.md) -- 项目概览与功能特性
- [CONTRIBUTING.md](CONTRIBUTING.md) -- 参与开发的完整流程
- [docs/troubleshooting.md](docs/troubleshooting.md) -- 更详细的故障排除指南
- [docs/quickstart.md](docs/quickstart.md) -- 5 分钟快速入门
- [docs/glossary.md](docs/glossary.md) -- 技术术语速查
- [docs/user-guide/getting-started.md](docs/user-guide/getting-started.md) -- 用户快速开始指南
- [docs/user-guide/ai-chat-guide.md](docs/user-guide/ai-chat-guide.md) -- AI 对话详细使用指南
