# PRODUCT_AUDIT.md

审计日期：2026-06-03  
项目路径：`D:\codehelper`  
审计范围：本轮仅审计 AI Provider 集成、密钥存储、出站隐私/安全边界、provider 兼容性，并结合产品化要求补齐第一阶段产品审计字段。

## 1. 第一阶段基础盘点

### 1.1 Git 状态

当前状态：

```text
## master...origin/master
 M package-lock.json
```

说明：仓库存在未提交的 `D:\codehelper\package-lock.json` 修改；本轮未修改源码实现，仅新增本审计文档与成熟度评分文档。

### 1.2 目录结构

顶层目录：

```text
D:\codehelper\.github
D:\codehelper\.husky
D:\codehelper\coverage
D:\codehelper\dist-release
D:\codehelper\docs
D:\codehelper\electron
D:\codehelper\node_modules
D:\codehelper\out
D:\codehelper\resources
D:\codehelper\scripts
D:\codehelper\src
D:\codehelper\tests
```

关键源码目录：

- `D:\codehelper\electron`：Electron 主进程、IPC、SQLite、运行器、AI 请求代理。
- `D:\codehelper\electron\ipc`：AI、Chat、RAG、导入导出、题库、统计等 IPC 边界。
- `D:\codehelper\electron\db`：SQLite schema 与数据库初始化。
- `D:\codehelper\src`：React 渲染层。
- `D:\codehelper\src\stores`：Zustand 状态管理。
- `D:\codehelper\src\modules\ai-chat`：AI 对话 UI。
- `D:\codehelper\src\modules\settings`：AI Provider 配置、记忆库、导入导出设置。

### 1.3 依赖

来自 `D:\codehelper\package.json`：

- 运行依赖：Electron/React 桌面应用核心，`better-sqlite3` 本地数据库，`zustand` 状态管理，`@monaco-editor/react` 编辑器，`pdf-parse` 知识库导入，`react-markdown` 与 `react-syntax-highlighter` 渲染。
- 开发依赖：`electron-vite`、`electron-builder`、`typescript`、`vitest`、`eslint`、`prettier`、`tailwindcss`。

### 1.4 数据流

AI 对话主路径：

1. 用户在 `D:\codehelper\src\modules\ai-chat\ChatView.tsx` 输入消息并选择模型配置。
2. `D:\codehelper\src\stores\chatStore.ts` 保存用户消息到 SQLite，并调用 `ragContextService.enrichMessages()` 注入题目、学习历史、知识库和用户画像上下文。
3. 渲染层通过 `D:\codehelper\src\api\ipc.ts` 的 typed IPC 调用 `ai-chat`。
4. `D:\codehelper\electron\ipc\ai.ts` 从 `ai_configs` 读取 Provider 配置，拼接 `{base_url}/chat/completions`，用 Bearer Key 发起 OpenAI-compatible streaming 请求。
5. 主进程通过 `ai-chat-chunk`、`ai-chat-done` 事件把 SSE 增量传回渲染层。
6. `chatStore.finishStream()` 保存助手回复到 `chat_history`。

AI 配置路径：

1. 用户在 `D:\codehelper\src\modules\settings\SettingsView.tsx` 填写 API Key、Base URL、模型。
2. 渲染层调用 `db-save-ai-config`。
3. `D:\codehelper\electron\ipc\database.ts` 使用 Electron `safeStorage` 加密 API Key 后写入 SQLite `ai_configs`。
4. 获取模型列表时调用 `{base_url}/models`。

### 1.5 状态管理

- `D:\codehelper\src\stores\chatStore.ts`：会话、消息、streaming 状态、当前 requestId、跨会话记忆。
- `D:\codehelper\src\stores\settingsStore.ts`：AI 配置列表、保存状态、错误状态。
- `D:\codehelper\src\api\ipc.ts`：对只读 IPC 结果做 30 秒缓存与请求去重。
- 主进程 `D:\codehelper\electron\ipc\ai.ts`：用 `activeRequests` 管理 requestId 到 AbortController 的映射，并设置 120 秒自动取消。

### 1.6 数据库

SQLite schema 位于 `D:\codehelper\electron\db\schema.sql`，数据库初始化位于 `D:\codehelper\electron\db\index.ts`。

AI/隐私相关表：

- `ai_configs`：Provider 名称、API Key、Base URL、模型、默认配置、任务类型。
- `chat_sessions`、`chat_history`：AI 会话和消息。
- `memories`：跨对话长期记忆。
- `knowledge_docs`、`knowledge_chunks`：知识库文档和切片。
- `settings`：通用设置。
- `analytics_events`：本地事件统计。

### 1.7 AI Provider 集成

实现文件：

- `D:\codehelper\electron\ipc\ai.ts`
- `D:\codehelper\electron\ipc\database.ts`
- `D:\codehelper\src\modules\settings\SettingsView.tsx`
- `D:\codehelper\src\stores\chatStore.ts`

当前 Provider 形态：OpenAI-compatible REST API。

支持能力：

- 自定义 Base URL。
- 自定义模型名。
- `/models` 拉取模型列表。
- `/chat/completions` streaming。
- 多配置保存与默认配置。

主要限制：

- 请求体固定为 OpenAI Chat Completions 结构，不支持 Anthropic Messages API、Gemini 原生 API、Ollama 非兼容差异、Azure OpenAI deployment 路径差异。
- 无 provider 类型字段与 adapter 层。
- 不支持非 streaming fallback；如果 Provider 不支持 SSE streaming，核心对话容易失败。
- 未校验 Base URL 协议，允许 `http://` 或本地/内网地址被主进程请求。

### 1.8 用户路径

核心路径：

1. 首次启动 → 设置页配置 AI 模型 → 获取模型 → 保存配置。
2. AI 助手页 → 新建会话 → 选择模型配置 → 输入问题 → 接收 streaming 回复。
3. 练题/知识库上下文通过 RAG 注入到 AI 请求。
4. 记忆库可手动管理，并在对话请求中注入相关长期记忆。
5. 导出/导入可携带聊天、知识库、记忆等数据，但不导出 `ai_configs`。

### 1.9 已知新鲜验证

- `npm run typecheck` 已通过。
- `npm run build` 已通过。
- `npm run dev` 已启动 Electron，renderer HTTP 200。
- 当前 Git 状态仍显示 `D:\codehelper\package-lock.json` 已修改。

## 2. 产品定位

CodeHelper 是面向编程学习者的 AI 驱动桌面编程助手：把 Monaco 编辑器、题库练习、知识库检索、错题追踪、跨会话记忆与 OpenAI-compatible AI 对话放在一个本地优先的 Electron 应用里。

更准确的定位不是“通用 IDE”，而是“本地学习数据驱动的编程训练与 AI 辅导桌面应用”。它的差异化来自本地题库/错题/知识库/学习历史与 AI 对话上下文融合，而不是模型调用本身。

## 3. 当前完成度

完成度判断：Beta 后段，接近可给早期用户试用，但未达到可商业化公开发布。

已完成：

- 桌面壳、主渲染架构、IPC 白名单、CSP、SQLite 持久化。
- AI 配置、模型拉取、OpenAI-compatible streaming 对话。
- 本地 RAG 上下文、记忆库、聊天历史。
- 题库、错题、知识库、统计、导入导出等学习闭环模块。
- 类型检查、构建和 Electron 启动已有新鲜通过记录。

未完成/不足：

- Provider 抽象不足，无法稳定覆盖主流商业模型与本地模型。
- Base URL 出站边界未收紧，存在 SSRF/内网访问风险。
- API Key 在渲染层和 IPC 返回值中以明文形式流动，虽然落库加密，但边界过宽。
- 缺少正式隐私说明、联网前数据发送提示、按上下文类别的发送开关。
- 商业化所需账号、授权、支付、遥测合规、更新渠道和签名发布不足。

## 4. 用户价值

核心用户价值：学习者能在一个本地桌面应用里完成“练题 → 出错 → 记录 → AI 解释 → 知识库补充 → 长期记忆个性化”的闭环。

高价值点：

- AI 不只是聊天，而是结合题目、历史、知识库和记忆给反馈。
- 本地保存学习资产，降低云端平台迁移成本。
- 适合自学者、训练营、校内课程和刷题人群。

## 5. 最大短板

最大短板：AI Provider 层仍是“OpenAI-compatible 单协议直连”，缺少产品级 Provider abstraction、兼容性测试矩阵、错误归因和隐私授权 UX。

这会导致用户配置不同模型服务时出现“能保存但不能用”“模型列表能拉但聊天失败”“不支持 streaming 就失败”等问题，并且很难向非技术用户解释。

## 6. 最大风险

[P1] 最大风险是出站请求边界与敏感上下文发送不可控。

证据：

- `D:\codehelper\electron\ipc\database.ts` 的 `ai-fetch-models` 直接使用用户输入 `base_url` 拼接 `/models` 并由主进程发起 `fetch`。
- `D:\codehelper\electron\ipc\ai.ts` 直接使用 `config.base_url` 拼接 `/chat/completions` 并发送聊天消息、RAG 上下文和长期记忆。
- 当前未限制协议为 HTTPS，也未阻止 localhost、内网 IP、file-like 绕过或重定向到内网地址。
- `D:\codehelper\src\utils\ragContextService.ts` 会把近期题目、学习历史、知识库片段、用户画像注入请求；`D:\codehelper\electron\ipc\ai.ts` 还可注入 `memories`。

影响：恶意/误配 Base URL 可把用户代码、学习记录、知识库片段、长期记忆发送到非预期服务；如果渲染层存在 XSS 或第三方内容注入，主进程 AI IPC 会成为出站代理。

修复方向：

- Provider 配置保存和请求发起时强制 HTTPS，默认拒绝 localhost、私网、link-local、metadata 地址；本地模型例外必须显式启用“本地 Provider 模式”。
- 只允许已保存且通过校验的 Provider 发起请求，不允许任意 URL 测试。
- 增加重定向后地址校验。
- 在发送 RAG/记忆/知识库前提供可见开关与发送预览。

## 7. 最有价值功能

最有价值功能：AI 对话与本地学习上下文融合。

具体由以下文件共同实现：

- `D:\codehelper\src\stores\chatStore.ts`
- `D:\codehelper\src\utils\ragContextService.ts`
- `D:\codehelper\electron\ipc\ai.ts`
- `D:\codehelper\electron\ipc\chat.ts`
- `D:\codehelper\electron\db\schema.sql`

它能把近期练习、知识库、用户画像和长期记忆注入 AI 请求，使回答具有个性化学习辅导属性。

## 8. 最缺失功能

最缺失功能：产品级 AI Provider 管理与隐私控制中心。

应包含：

- Provider 类型：OpenAI-compatible、Anthropic、Gemini、Azure OpenAI、Ollama/LM Studio、本地兼容模式。
- Adapter 层：按 Provider 生成 URL、headers、body、stream parser、错误映射。
- 兼容性检测：模型列表、chat、stream、非 stream fallback、超时、限流、鉴权错误。
- 隐私控制：发送前预览、上下文类别开关、敏感字段脱敏、按会话禁用记忆/RAG。
- 密钥边界：渲染层不再读取完整 API Key，改为保存时写入、编辑时显示占位、请求时主进程内部解密。

## 9. 发布阻塞项

发布阻塞项：

1. [P1] 收紧 AI Provider Base URL 出站边界，至少强制 HTTPS 并拒绝私网/metadata 地址；本地模型用显式本地模式。
2. [P1] 避免 `db-get-ai-configs` 把完整明文 API Key 返回给渲染层；设置页编辑时应使用占位与“重新输入”流程。
3. [P1] 增加 RAG/记忆发送提示和按类别开关，避免用户误把知识库文件、代码、学习画像发给第三方 Provider。
4. [P2] 增加 Provider 兼容性测试，覆盖不支持 streaming、非 OpenAI 错误结构、超时、401、429、5xx。
5. [P2] 明确导出/导入不包含 `ai_configs`，并在 UI 中说明 API Key 不会被导出。
6. [P2] 发布包签名、自动更新、崩溃日志策略、隐私政策、用户协议。

## 10. 商业化阻塞项

商业化阻塞项：

- 无账号体系、授权体系、License 校验或组织版管理。
- 无付费墙、套餐边界、试用策略、离线授权策略。
- 无正式隐私政策、数据处理协议、模型 Provider 责任边界说明。
- 无商业支持所需的日志采集/诊断导出/版本升级通道。
- AI 成本当前主要 BYOK，但 Provider 配置复杂，非技术用户转化会受阻。
- 缺少教学机构/训练营场景的班级、作业、老师视图和内容分发能力。

## 11. 审计发现：AI Provider / 密钥 / 出站边界 / 兼容性

### [P1] Base URL 未限制 HTTPS 与私网地址，主进程可被用作任意出站请求代理

文件：

- `D:\codehelper\electron\ipc\database.ts`
- `D:\codehelper\electron\ipc\ai.ts`

问题：`ai-fetch-models` 与 `ai-chat` 使用用户可控 `base_url` 由主进程发起请求，无 HTTPS 强制、私网阻断、重定向校验。

影响：用户代码、聊天、知识库、记忆可能被发送到非预期端点；若渲染层被攻破，该 IPC 可成为 SSRF/内网探测出口。

修复方向：统一 URL validator，默认仅允许 HTTPS 公网域名；本地模型需单独勾选并只允许 loopback；所有重定向目标继续校验。

### [P1] API Key 解密后通过 `db-get-ai-configs` 返回渲染层，密钥暴露面过宽

文件：

- `D:\codehelper\electron\ipc\database.ts`
- `D:\codehelper\src\stores\settingsStore.ts`
- `D:\codehelper\src\modules\ai-chat\ChatView.tsx`

问题：`db-get-ai-configs` 会把 `ai_configs` 全量解密返回，渲染层只需要展示配置名和模型，但却拿到完整 API Key。

影响：Electron 渲染层 XSS、调试工具、第三方组件漏洞都可能读取明文 Key。

修复方向：列表接口返回 masked key 或 `has_api_key`；保存接口支持不传 key 表示沿用旧 key；AI 请求在主进程内部按 configId 解密。

### [P2] `safeStorage` 不可用时回退明文 SQLite，缺少用户可见阻断或降级提示

文件：`D:\codehelper\electron\ipc\database.ts`

问题：`safeStorage.isEncryptionAvailable()` 为 false 时仅 `console.warn`，仍保存明文 API Key。

影响：部分 Linux/无系统 keychain 环境下用户误以为密钥已安全保存。

修复方向：保存前向 UI 返回明确状态，要求用户确认“明文保存”或改用系统凭据/不持久化。

### [P2] Provider 兼容性只覆盖 OpenAI-compatible streaming

文件：`D:\codehelper\electron\ipc\ai.ts`

问题：请求体、鉴权、URL、SSE parser 固定为 OpenAI Chat Completions。

影响：Anthropic、Gemini、Azure OpenAI、本地模型和部分代理服务需要不同路径或 stream 格式，用户配置失败率高。

修复方向：引入 Provider adapter，并提供兼容性测试矩阵。

### [P2] AI 错误响应可能把 Provider 返回体片段暴露到 UI

文件：`D:\codehelper\electron\ipc\ai.ts`

问题：非 2xx 时将 response text 截取 300 字拼入错误。多数 Provider 不返回 Key，但代理错误可能包含请求细节。

影响：错误文本可能泄露上游服务内部信息或用户请求摘要。

修复方向：按状态码映射用户友好错误，详细 body 仅写本地日志并脱敏。

## 12. 结论

CodeHelper 的产品骨架和学习闭环已经比较完整，AI 体验也具备明显用户价值。但若要发布给真实用户，必须优先处理 AI Provider 出站边界、密钥暴露面、隐私发送控制和 Provider 兼容性。当前最适合定位为“早期试用版/Beta”，不宜作为可商业化稳定版直接推广。
