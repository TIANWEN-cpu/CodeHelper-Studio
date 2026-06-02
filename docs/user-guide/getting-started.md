# 快速开始

本指南帮助你从零开始安装并运行 CodeHelper，配置 AI 服务，快速上手使用。

## 环境要求

| 工具     | 最低版本 | 推荐版本 | 说明                    |
| -------- | -------- | -------- | ----------------------- |
| Node.js  | 18       | 20 LTS   | 运行时环境              |
| npm      | 9        | 最新     | 随 Node.js 安装         |
| 操作系统 | -        | -        | Windows / macOS / Linux |

### 代码运行器可选依赖

代码运行器功能需要系统中安装对应的编译器或运行时。未安装的语言不影响其他功能使用。

| 语言    | 依赖             | 安装说明                                                                      |
| ------- | ---------------- | ----------------------------------------------------------------------------- |
| Python  | `python` >= 3.8  | [python.org](https://www.python.org/downloads/) 或系统包管理器                |
| C       | `gcc`            | Windows: MinGW-w64; macOS: `xcode-select --install`; Linux: `build-essential` |
| C++     | `g++`            | 同上                                                                          |
| C#      | `dotnet` >= 6    | [dotnet.microsoft.com](https://dotnet.microsoft.com/download)                 |
| Java    | `javac` / `java` | [Adoptium](https://adoptium.net/)                                             |
| Node.js | `node`           | 已随 Node.js 安装                                                             |
| SQL     | 无需额外依赖     | 内置内存数据库执行                                                            |

## 安装

### 方式一：从源码运行（推荐开发者）

```bash
# 克隆仓库
git clone https://github.com/TIANWEN-cpu/CodeHelper.git
cd CodeHelper

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

> **注意**：`better-sqlite3` 是原生模块，需要 C++ 编译工具链。如遇编译错误：
>
> - Windows：安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，勾选"使用 C++ 的桌面开发"
> - macOS：运行 `xcode-select --install`
> - Linux：运行 `sudo apt install build-essential python3`

### 方式二：使用安装包

1. 从 [GitHub Releases](https://github.com/TIANWEN-cpu/CodeHelper/releases) 下载最新安装包
2. Windows 用户下载 `CodeHelper Setup x.x.x.exe`，双击安装
3. 也可使用免安装版 `win-unpacked/CodeHelper.exe` 直接运行

### 构建自己的安装包

```bash
npm run build:win     # Windows
npm run build:mac     # macOS
npm run build:linux   # Linux
```

产物位于 `dist-release/` 目录。

## 首次启动

1. 启动 CodeHelper 后，你将看到左侧导航栏，包含以下模块入口：
   - **刷题** - 题库练习系统
   - **编辑器** - Monaco 代码编辑器
   - **AI助手** - AI 智能对话
   - **错题本** - 错题追踪与分析
   - **知识库** - 文档检索系统
   - **设置** - 应用配置

2. 默认主题为 **Catppuccin Mocha** 暗色主题，可在设置中切换

3. 左侧栏底部有收起/展开按钮，可根据需要调整侧栏宽度

## API 配置

CodeHelper 的 AI 功能需要配置 OpenAI 兼容的 API 服务。支持任意兼容 OpenAI API 格式的服务提供商。

### 添加 API 配置

1. 点击左侧导航栏的 **设置** 图标
2. 在 AI 配置区域点击 **添加配置**
3. 填写以下信息：

| 字段     | 说明                                     | 示例                        |
| -------- | ---------------------------------------- | --------------------------- |
| 名称     | 配置的显示名称                           | `GPT-4o`                    |
| API Key  | API 密钥（加密存储于本地）               | `sk-xxx`                    |
| Base URL | API 服务地址（不含 `/chat/completions`） | `https://api.openai.com/v1` |
| 模型     | 模型名称                                 | `gpt-4o`                    |
| 设为默认 | 勾选后该配置为默认使用的模型             | -                           |
| 任务类型 | 可选，用于区分不同场景的配置             | `chat`、`code-review`       |

4. 点击 **保存** 即可

### 常见 API 服务配置示例

| 服务         | Base URL                      | 模型示例                |
| ------------ | ----------------------------- | ----------------------- |
| OpenAI       | `https://api.openai.com/v1`   | `gpt-4o`、`gpt-4o-mini` |
| DeepSeek     | `https://api.deepseek.com/v1` | `deepseek-chat`         |
| Ollama 本地  | `http://localhost:11434/v1`   | `llama3`、`qwen2`       |
| 其他兼容服务 | 对应服务的 API 地址           | 对应模型名称            |

### 获取可用模型列表

配置好 API Key 和 Base URL 后，系统会自动调用 `/models` 接口获取可用模型列表，你也可以在模型下拉框中手动输入。

### 多模型管理

- 支持添加多个 API 配置
- 每次只能有一个默认配置
- AI 对话时可选择使用特定配置（通过 `configId` 参数）

## 数据存储位置

CodeHelper 使用本地 SQLite 数据库存储所有数据：

| 操作系统 | 数据库路径                                               |
| -------- | -------------------------------------------------------- |
| Windows  | `%APPDATA%/codehelper/codehelper.db`                     |
| macOS    | `~/Library/Application Support/codehelper/codehelper.db` |
| Linux    | `~/.config/codehelper/codehelper.db`                     |

> **安全说明**：API Key 使用 Electron 的 `safeStorage` API 加密后存储，不会以明文形式保存在数据库中。

## 下一步

- [编辑器指南](editor-guide.md) - 了解 Monaco 编辑器的全部功能
- [AI 对话指南](ai-chat-guide.md) - 学习如何与 AI 高效对话
- [题库指南](problems-guide.md) - 开始刷题练习
- [设置指南](settings-guide.md) - 自定义你的 CodeHelper

---

## See Also

- [编辑器指南](editor-guide.md) -- Monaco Editor 详细使用说明
- [题库指南](problems-guide.md) -- 题库系统完整功能
- [AI 对话指南](ai-chat-guide.md) -- AI 助手高级功能
- [错题本指南](mistakes-guide.md) -- 错题追踪与复习
- [知识库指南](knowledge-guide.md) -- 文档导入与检索
- [设置指南](settings-guide.md) -- AI 配置与主题
- [快速入门 (docs/)](../quickstart.md) -- 5 分钟上手教程
- [FAQ.md](../../FAQ.md) -- 常见问题
- [术语表](../glossary.md) -- 技术名词解释
