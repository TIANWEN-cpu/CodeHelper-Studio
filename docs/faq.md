# 常见问题 (FAQ)

本文档按模块分类整理 CodeHelper 的常见问题。根目录 [FAQ.md](../FAQ.md) 包含精简版。

---

## 目录

- [安装与环境](#安装与环境)
- [Monaco 编辑器](#monaco-编辑器)
- [代码运行器](#代码运行器)
- [AI 对话](#ai-对话)
- [题库系统](#题库系统)
- [错题本](#错题本)
- [知识库 RAG](#知识库-rag)
- [设置与配置](#设置与配置)
- [键盘快捷键](#键盘快捷键)
- [开发相关](#开发相关)
- [性能](#性能)

---

## 安装与环境

### Q: npm install 报错 better-sqlite3 编译失败怎么办？

`better-sqlite3` 是原生 Node 模块，需要 C++ 编译工具链：

- **Windows**: 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，选择"使用 C++ 的桌面开发"工作负载
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`

安装后执行 `rm -rf node_modules && npm install` 重新编译。

### Q: electron 下载超时怎么办？

设置 Electron 下载镜像：

```bash
# 临时设置
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install

# 永久设置
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
```

### Q: npm install 超时怎么办？

使用国内 npm 镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

### Q: 需要安装哪些编程语言的编译器？

代码运行器功能是可选的，不影响其他功能使用：

| 语言       | 需要安装            | 说明                        |
| ---------- | ------------------- | --------------------------- |
| Python     | Python >= 3.8       | `python.org` 或系统包管理器 |
| C          | gcc（MinGW-w64 等） | Windows 推荐 MSYS2          |
| C++        | g++（同 gcc）       | 与 C 共享编译器             |
| C#         | .NET SDK >= 6       | `dotnet.microsoft.com`      |
| Java       | JDK >= 11           | 推荐 Adoptium               |
| JavaScript | Node.js             | 已随 Node.js 安装           |
| SQL        | 无需额外安装        | 使用内置 SQLite             |
| Verilog    | Icarus Verilog      | 可选，用于硬件题            |

### Q: Node.js 版本要求是什么？

要求 Node.js >= 18，推荐使用 LTS 版本。可通过 `node --version` 查看当前版本。

---

## Monaco 编辑器

### Q: Monaco Editor 和 VS Code 有什么关系？

Monaco Editor 是 VS Code 的核心编辑器组件。CodeHelper 直接使用了这个编辑器引擎，因此提供与 VS Code 相同的编辑体验：语法高亮、智能补全、代码折叠、括号匹配等。

### Q: 如何切换小地图 (Minimap)？

在编辑器中右键点击，或使用设置面板中的 Minimap 开关。偏好会自动保存到 localStorage。

### Q: 编辑器标签页关闭后能恢复吗？

标签页状态通过 localStorage 持久化，包括代码内容、光标位置和滚动位置。重启应用后自动恢复。清除浏览器数据会导致标签页丢失。

### Q: Monaco Editor 加载缓慢？

首次加载需下载语言包和编辑器 worker，后续会缓存。如持续缓慢，检查网络连接。

### Q: 如何自定义编辑器字体？

当前支持的字体族为 `'Cascadia Code', 'Fira Code', Consolas, monospace`。字体大小和 Tab 宽度可在设置中调整。

---

## 代码运行器

### Q: 代码运行器提示"找不到命令"？

确保对应语言的编译器/运行时已安装并添加到系统 PATH 中。详见上方[需要安装哪些编程语言的编译器？](#q-需要安装哪些编程语言的编译器)。

在终端中验证：

```bash
python --version    # Python
gcc --version       # C
g++ --version       # C++
javac -version      # Java
dotnet --version    # C#
node --version      # JavaScript
```

### Q: 代码运行超时怎么办？

代码运行器有 10 秒超时限制。如果代码需要长时间运行：

1. 检查是否有死循环
2. 优化算法效率
3. 对于确实需要长时间运行的代码，建议在本地终端运行

### Q: 代码运行器的输出限制是什么？

- 最大输出：1MB（超过时截断）
- 最大并发：5 个进程
- 默认超时：10 秒

### Q: SQL 题目怎么运行？

SQL 题目使用内置的内存 SQLite 数据库执行，无需外接数据库。代码中可以包含多条语句，最后一条如果是 SELECT 查询，其结果作为输出。

### Q: 如何向代码传递输入？

在代码运行器的 stdin 输入框中填写标准输入内容。程序执行时会从 stdin 读取。

---

## AI 对话

### Q: 如何配置 AI 服务？

进入设置模块，添加 AI 配置：

1. 填写名称、API Key、Base URL 和模型名称
2. 点击保存
3. 可勾选"设为默认"将此配置作为默认配置
4. 详细步骤参见 [用户指南 - API 配置](user-guide/getting-started.md#api-配置)

### Q: 支持哪些 AI 服务？

支持所有兼容 OpenAI API 格式的服务：

- OpenAI（GPT-4o、GPT-4o-mini 等）
- DeepSeek
- 本地 Ollama（`http://localhost:11434/v1`）
- Azure OpenAI
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
3. 确认 Base URL 正确（不含 `/chat/completions` 后缀）
4. 检查网络连接（部分服务可能需要代理）
5. 打开 DevTools (Ctrl+Shift+I) 查看控制台错误

### Q: API Key 存储安全吗？

API Key 使用 Electron 的 `safeStorage` API 进行操作系统级加密后存储，不会以明文形式出现在数据库中。

### Q: AI 的长期记忆是什么？

长期记忆系统允许 AI 跨会话记住你的偏好和重要信息：

- **自动提取**：对话中包含偏好声明、自我介绍等内容时自动提取
- **手动管理**：在记忆管理面板中手动添加、编辑或删除
- **上下文注入**：AI 对话时自动检索相关记忆并注入上下文
- **分类与置信度**：记忆可设分类和置信度，支持置顶

### Q: 预设提示词是什么？

预设提示词是可复用的系统级提示词模板。内置预设包括代码解释、Bug 修复等常用场景。你也可以创建自定义预设，在对话时快速切换。

### Q: 如何查看 AI 使用的模型？

在聊天界面底部状态栏会显示当前使用的 AI 模型名称。切换配置可在设置中进行。

---

## 题库系统

### Q: 有多少道题目？

当前内置 158+ 道题目，覆盖：

- 基础练习：48 道（内置题库）
- 力扣经典：80 道
- 数学建模：30 道

### Q: 支持哪些编程语言？

支持 Python、C、C++、C#、JavaScript 和 SQL 六种语言。每道题会标注支持的语言列表。

### Q: 如何筛选题目？

支持多维度筛选：

- **难度**：简单、中等、困难
- **标签**：算法分类（动态规划、贪心等）
- **来源**：题库来源（力扣、牛客等）
- **赛道**：学习路径（考研复试、保研夏令营等）
- **平台**：在线平台（LeetCode、PAT 等）
- **模式**：题目类型（OJ、仿真题等）

### Q: 判题结果准确吗？

判题引擎对输出进行规范化比较（去除首尾空白、统一换行符等）。SQL 题目还会标准化 SQL 格式后比较。对于需要精确输出匹配的题目，建议严格按照示例格式输出。

### Q: 如何添加自定义题目？

在 `resources/problems/` 目录下创建 JSON 文件，格式参考现有的 `basic.json`。重启应用后自动同步到数据库。

### Q: AI 侧边栏是什么？

在做题时可以打开 AI 侧边栏，直接向 AI 请教当前题目的解题思路。AI 会看到题目描述和你当前的代码。

---

## 错题本

### Q: 错题是怎么收集的？

每次在题库系统中提交代码被判为失败（答案错误、编译错误、运行时错误、超时），系统会自动将该题目添加到错题本中。

### Q: 同一道题多次做错会怎样？

错题本会累加错误次数，并记录所有出现过的错误类型。最新一次的错误代码会覆盖之前的记录。

### Q: 做对了错题本会更新吗？

是的，当你通过之前做错的题目时，你的正确代码会自动保存到错题本中，方便对比学习。

### Q: AI 分析错题是什么功能？

在错题本中点击"AI 分析"按钮，AI 会分析你的错误代码，指出问题所在并给出改进建议。分析结果会保存在错题记录中。

---

## 知识库 RAG

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
- 每个关键词至少 2 个字符

### Q: 知识库的分块策略是什么？

文档自动按约 500 字符分块，检索时返回最相关的 5 个分块，按关键词匹配频率评分排序。

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

删除数据库文件后重启应用即可完全重置。注意：这会清除所有数据，无法恢复。

### Q: 有哪些主题可选？

内置三套暗色主题：

- **Catppuccin Mocha**（默认）- 经典暗色主题，紫色强调色
- **Fjord** - 北欧峡湾风格暗色主题
- **Ember** - 暖色调暗色主题

### Q: 如何切换主题？

在设置页面的主题选择区域点击对应主题即可切换。主题设置自动保存到数据库。

---

## 键盘快捷键

| 快捷键         | 功能         |
| -------------- | ------------ |
| `Ctrl+P`       | 打开全局搜索 |
| `Ctrl+Shift+P` | 打开命令面板 |
| `Ctrl+B`       | 切换侧栏折叠 |

> macOS 用户将 `Ctrl` 替换为 `Cmd`。

---

## 开发相关

### Q: 如何参与 CodeHelper 开发？

参阅 [CONTRIBUTING.md](../CONTRIBUTING.md)，基本流程：

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

在 [GitHub Issues](https://github.com/TIANWEN-cpu/CodeHelper/issues) 中使用功能请求模板提交。

### Q: 项目的许可证是什么？

CodeHelper 基于 [MIT License](https://github.com/TIANWEN-cpu/CodeHelper/blob/main/LICENSE) 开源。

### Q: 如何运行测试？

```bash
npm test                    # 运行一次
npm run test:watch          # 监听模式
npm run test:coverage       # 生成覆盖率报告
npm run test:ui             # 可视化测试界面
```

### Q: 如何调试 IPC 通信？

在 `electron/preload.ts` 的 `invoke` 函数中添加日志：

```typescript
invoke: (channel: string, ...args: unknown[]) => {
  console.log('[IPC invoke]', channel, args)
  // ...原有逻辑
}
```

Main 进程日志输出在启动 `npm run dev` 的终端中。

### Q: 项目架构是什么？

CodeHelper 采用 Electron 三进程模型：

- **Main Process**（`electron/`）：窗口管理、IPC 路由、数据库、代码执行
- **Preload Script**（`electron/preload.ts`）：安全桥接、通道白名单
- **Renderer Process**（`src/`）：React SPA、Zustand 状态管理、Monaco Editor

详细架构参见 [docs/architecture.md](architecture.md)。

---

## 性能

### Q: 应用启动很慢怎么办？

1. 首次启动会初始化数据库和同步题库数据，后续启动会更快
2. 确认没有杀毒软件扫描 Electron 目录
3. 开发模式下比生产模式慢，使用 `npm run build` 后体验更佳

### Q: Monaco Editor 占用内存很高？

Monaco Editor 会为每种语言加载语法解析器。关闭不用的标签页可释放内存。编辑器已启用大文件优化（`largeFileOptimizations: true`）。

### Q: AI 对话响应很慢？

响应速度取决于 AI 服务提供商和网络延迟。流式输出可以逐字显示，减少感知延迟。可以尝试切换更快的模型或服务。
