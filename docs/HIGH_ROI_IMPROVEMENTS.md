# CodeHelper 高 ROI 改进项

> 生成日期：2026-06-02
> 基于：成熟度评分卡、安全审计报告、源码深度分析、改进计划
> 当前综合成熟度：L2 MVP
> 目标：以最小投入撬动最大产品价值，7 项改进全部可在 1 个冲刺周期（2-3 周）内完成

---

## 评分方法

- **Impact（1-10）**：对用户体验、产品竞争力、安全性的影响程度
- **Effort（1-10）**：实现所需工作量（10 = 最费力）
- **ROI = Impact / Effort**：值越高越优先

---

## TOP 7 改进项（本冲刺执行）

### 1. AI 上下文感知注入

| 字段       | 值       |
| ---------- | -------- |
| **优先级** | P1       |
| **Impact** | 10       |
| **Effort** | 3        |
| **ROI**    | **3.33** |

**问题描述**

当前 AI 对话是纯聊天窗口，完全不知道用户在做哪道题、写了什么代码。`electron/ipc/ai.ts` 中的 `injectMemories` 仅注入长期记忆，未注入编程上下文。这是成熟度评分卡中"AI 能力 L1"的根本原因——作为编程助手，AI 不理解用户的编程场景。

**实现方案**

在 `sendMessage` 调用链中，自动将以下信息注入 system message：

- 当前题目标题、描述、难度、标签
- 用户当前编辑器中的代码
- 最近一次提交的结果（通过/失败、错误信息）

具体改动：

1. `src/stores/chatStore.ts` 的 `sendMessage` 方法读取 `problemStore` 和 `editorStore` 的当前状态
2. 构建 context system message，格式化为结构化文本
3. 在 `electron/ipc/ai.ts` 的 messages 数组头部插入 context message
4. 添加开关：用户可在设置中关闭自动上下文注入

**涉及文件**

- `D:\codehelper\src\stores\chatStore.ts` — sendMessage 方法
- `D:\codehelper\electron\ipc\ai.ts` — injectMemories 函数扩展
- `D:\codehelper\src\modules\ai-chat\ChatView.tsx` — 上下文状态显示
- `D:\codehelper\src\modules\problems\AISidebar.tsx` — 侧边栏 AI 复用

**成功指标**

- AI 回答中提及当前题目名称或代码变量名的比例 > 80%
- 用户手动描述题目的消息数量下降 > 50%
- AI 对话满意度（可用调研）提升

---

### 2. 新用户引导流程（Onboarding Wizard）

| 字段       | 值       |
| ---------- | -------- |
| **优先级** | P1       |
| **Impact** | 9        |
| **Effort** | 2        |
| **ROI**    | **4.50** |

**问题描述**

新用户首次打开应用后直接看到空白题目列表和一个编辑器标签页，没有任何引导。不会配置 AI API Key 的用户直接丧失一半功能价值。成熟度评分卡明确指出"没有引导等于没有产品"。当前已有 task #294 创建 onboarding store，但尚未集成到主流程。

**实现方案**

实现 3 步引导流程：

1. **欢迎页**：产品定位说明 + 核心功能预览（3 张截图/GIF）
2. **API Key 配置**：引导用户添加第一个 AI 配置，提供"智能粘贴"解析 OpenAI 格式 URL
3. **第一道题**：自动选一道 easy 题目，引导用户完成"读题 -> 写代码 -> 运行 -> 查看 AI 分析"完整流程

技术实现：

- 在 `App.tsx` 中检查 `settings` 表的 `onboarding_completed` 键
- 未完成时渲染 `OnboardingWizard` 组件替代主界面
- 完成后写入设置键，后续启动跳过

**涉及文件**

- `D:\codehelper\src\App.tsx` — 条件渲染引导页
- `D:\codehelper\src\components\OnboardingWizard.tsx` — 新建，引导组件
- `D:\codehelper\src\stores\appStore.ts` — onboarding 状态
- `D:\codehelper\electron\db\schema.sql` — 无需改动（settings 表已存在）

**成功指标**

- 新用户完成引导流程的比例 > 70%
- 引导完成后 7 日留存率 > 40%
- 首次配置 API Key 的平均时间 < 2 分钟

---

### 3. 代码执行安全沙箱

| 字段       | 值       |
| ---------- | -------- |
| **优先级** | P0       |
| **Impact** | 9        |
| **Effort** | 4        |
| **ROI**    | **2.25** |

**问题描述**

`electron/utils/codeRunner.ts` 直接使用 `spawn`/`spawnSync` 执行用户代码，无资源限制。Python 脚本可执行 `import os; os.system('rm -rf /')`、C 程序可进入死循环耗尽 CPU。安全审计报告标注此为 BLOCK 级问题。虽然有 `MAX_OUTPUT_SIZE`（1MB）和 `MAX_CONCURRENT`（5）限制，但缺少 CPU 时间、内存使用和文件系统隔离。

**实现方案**

分层防护：

1. **超时强制终止**：为所有 `spawn` 添加 `timeout` 参数（Python 10s / C/C++ 编译 10s + 运行 5s / C# 编译 10s + 运行 5s）
2. **CPU 资源限制**：Windows 上通过 Job Object 限制子进程 CPU 时间；跨平台 fallback 到超时
3. **工作目录隔离**：将 `getTempDir()` 改为每次运行创建独立子目录，运行后清理
4. **危险导入拦截（Python）**：在代码执行前注入受限的 `__builtins__`，移除 `os`、`subprocess`、`sys` 等模块的直接访问（可选，作为增强层）
5. **输出截断已有**：保持现有的 1MB 输出限制

**涉及文件**

- `D:\codehelper\electron\utils\codeRunner.ts` — runProcess 函数添加 timeout + cleanup
- `D:\codehelper\electron\ipc\runner.ts` — 无需改动（已做输入校验）
- `D:\codehelper\docs\security-audit.md` — 更新审计状态

**成功指标**

- 死循环代码在 10 秒内被终止（当前：无限挂起）
- 内存炸弹（如 Python `[0]*10**9`）不导致宿主进程 OOM
- 安全审计 BLOCK-1 项标记为已修复

---

### 4. 渐进式 AI 提示模式

| 字段       | 值       |
| ---------- | -------- |
| **优先级** | P2       |
| **Impact** | 9        |
| **Effort** | 3        |
| **ROI**    | **3.00** |

**问题描述**

当前 AI 对话直接给出完整答案，这对学习场景是负面的。成熟度评分卡在 AI 能力维度明确要求"渐进式提示模式：不直接给出完整答案，而是分步引导用户思考"。这是 CodeHelper 区别于通用 ChatGPT 的核心差异化特性——"AI 刷题教练"定位的关键。

**实现方案**

1. 在 `prompt_presets` 表中新增 3 条内置预设：
   - **思路引导**：只提示算法方向，不给代码
   - **代码提示**：给出关键代码片段的框架，留空让用户填写
   - **逐步分析**：先让用户自己分析错误，再给出建议
2. 在 `ChatView.tsx` 的输入区域添加"提示级别"选择器（直接回答 / 思路引导 / 代码提示）
3. 选择的级别作为 system message 的一部分发送给 AI
4. 在 `AISidebar.tsx`（题目侧边栏）默认使用"思路引导"模式

**涉及文件**

- `D:\codehelper\electron\db\schema.sql` — prompt_presets 表新增内置数据
- `D:\codehelper\src\modules\ai-chat\ChatView.tsx` — 提示级别选择器
- `D:\codehelper\src\modules\problems\AISidebar.tsx` — 默认模式设置
- `D:\codehelper\electron\ipc\chat.ts` — 内置预设种子数据

**成功指标**

- 使用渐进式提示的对话占比 > 30%
- 用户在同一题目上的平均尝试次数增加（说明在思考而非直接抄答案）
- "思路引导"预设使用频率进入 Top 3

---

### 5. 统计数据迁移至 SQLite

| 字段       | 值       |
| ---------- | -------- |
| **优先级** | P0       |
| **Impact** | 8        |
| **Effort** | 3        |
| **ROI**    | **2.67** |

**问题描述**

成熟度评分卡和改进计划均将此列为 BLOCK-3 级问题。当前统计面板（StatsView）的数据来源不明确——`analytics_events` 表已存在于 schema.sql 中，但部分统计数据可能仍依赖 localStorage 或内存计算。localStorage 数据在清缓存、换设备时全部丢失，用户不敢投入时间。

**实现方案**

1. 确认 `StatsView.tsx` 的数据来源，将所有 localStorage 读写迁移至 SQLite
2. 基于已有 `submissions`、`mistakes`、`chat_history` 表构建统计查询：
   - 每日/每周做题数量和通过率
   - 按难度分布的题目完成情况
   - AI 对话频次和时长
   - 错题复习次数和转化率
3. 利用 `analytics_events` 表记录关键行为事件（题目开始、提交、AI 对话等）
4. 添加数据导出功能（JSON 格式），让用户可以备份自己的数据

**涉及文件**

- `D:\codehelper\src\modules\stats\StatsView.tsx` — 数据来源迁移
- `D:\codehelper\src\stores\appStore.ts` — 统计 actions
- `D:\codehelper\electron\ipc\database.ts` — 新增统计查询 IPC
- `D:\codehelper\electron\db\schema.sql` — 可能新增统计视图

**成功指标**

- localStorage 中不再存储任何业务数据
- 清除浏览器缓存后统计数据完整保留
- 支持 JSON 格式数据导出

---

### 6. 错题本间隔复习系统

| 字段       | 值       |
| ---------- | -------- |
| **优先级** | P2       |
| **Impact** | 8        |
| **Effort** | 3        |
| **ROI**    | **2.67** |

\*\*问题描述`

错题本是 CodeHelper 的核心学习功能之一，当前仅记录错误信息和 AI 分析，缺少主动复习机制。`mistakes` 表中已有 `review_count` 和 `next_review_at` 字段（schema.sql 第 44-45 行），但前端和后端均未使用。成熟度评分卡将"间隔复习（Spaced Repetition）"列为功能完整度 L3 的必要条件。

**实现方案**

1. 实现 SM-2 算法（SuperMemo 2）的简化版：
   - 用户对错题进行"自评"（完全不会 / 模糊 / 已掌握）
   - 根据自评结果计算下次复习时间
   - 更新 `mistakes.next_review_at` 字段
2. 在 Sidebar 添加"待复习"角标提示
3. 在 MistakesView 中增加"今日复习"标签页，展示 `next_review_at <= NOW()` 的错题
4. 复习完成后更新 `review_count` 和 `next_review_at`

**涉及文件**

- `D:\codehelper\src\modules\mistakes\MistakesView.tsx` — 新增"今日复习"标签
- `D:\codehelper\electron\ipc\mistakes.ts` — 添加复习调度逻辑
- `D:\codehelper\src\stores\problemStore.ts` — 复习状态管理
- `D:\codehelper\src\components\Sidebar.tsx` — 复习角标

**成功指标**

- 错题 7 日内复习率 > 60%
- 复习过的错题再次出错率下降 > 30%
- "今日复习"标签页日均使用率 > 50%

---

### 7. 生产代码清理 + 结构化日志

| 字段       | 值       |
| ---------- | -------- |
| **优先级** | P1       |
| **Impact** | 6        |
| **Effort** | 2        |
| **ROI**    | **3.00** |

**问题描述**

成熟度评分卡明确指出"console.log 残留"是可维护性维度的核心短板。源码审查发现 `ChatView.tsx`（第 33-36 行）、`SettingsView.tsx`（第 72-74 行）、`appStore.ts`（第 46 行）等多处使用 `console.error`/`console.warn`，这些在生产环境中无法收集、无法过滤，属于无效日志。同时 task #245（移除 console.log）长期 pending。

**实现方案**

1. **全局搜索替换**：将所有 `console.log`、`console.error`、`console.warn` 替换为统一的 `logger` 调用
2. **创建 `src/utils/logger.ts`**：基于 `electron/utils/perfMonitor` 的模式，创建前端日志工具：
   - 支持 `debug`/`info`/`warn`/`error` 四个级别
   - 生产环境自动过滤 `debug` 级别
   - 日志格式统一为 `[模块名][级别] 消息`
3. **Electron 侧日志**：在 main process 中使用 `electron-log` 或自建日志写入文件
4. **移除死代码**：配合清理未使用的导入和导出（task #246）

**涉及文件**

- `D:\codehelper\src\utils\logger.ts` — 新建，前端日志工具
- `D:\codehelper\src\modules\ai-chat\ChatView.tsx` — 替换 console 调用
- `D:\codehelper\src\modules\settings\SettingsView.tsx` — 替换 console 调用
- `D:\codehelper\src\stores\*.ts` — 替换所有 store 中的 console 调用
- `D:\codehelper\electron\main.ts` — 集成结构化日志

**成功指标**

- 生产代码中 `console.log`/`console.error`/`console.warn` 数量为 0
- 所有错误日志可通过统一入口查看
- ESLint 规则 `no-console` 开启且 0 warning

---

## 综合优先级矩阵

| 排名 | 改进项                    | 优先级 | Impact | Effort | ROI  | 预计工时 |
| ---- | ------------------------- | ------ | ------ | ------ | ---- | -------- |
| 1    | 新用户引导流程            | P1     | 9      | 2      | 4.50 | 2-3 天   |
| 2    | AI 上下文感知注入         | P1     | 10     | 3      | 3.33 | 3-5 天   |
| 3    | 渐进式 AI 提示模式        | P2     | 9      | 3      | 3.00 | 3-5 天   |
| 4    | 生产代码清理 + 结构化日志 | P1     | 6      | 2      | 3.00 | 1-2 天   |
| 5    | 统计数据迁移至 SQLite     | P0     | 8      | 3      | 2.67 | 3-4 天   |
| 6    | 错题本间隔复习系统        | P2     | 8      | 3      | 2.67 | 3-5 天   |
| 7    | 代码执行安全沙箱          | P0     | 9      | 4      | 2.25 | 4-6 天   |

**总预计工时**：19-26 天（1 人全职，约 3-4 周，含测试）

---

## 执行顺序建议

### 第一周：安全 + 快速胜利

1. 生产代码清理 + 结构化日志（1-2 天）—— 立即可做，无依赖
2. 代码执行安全沙箱（4-6 天）—— P0 安全阻塞项，发布前必修

### 第二周：核心产品力

3. 新用户引导流程（2-3 天）—— 最高 ROI，用户体验 L1 -> L2 的关键
4. AI 上下文感知注入（3-5 天）—— AI 能力 L1 -> L2 的关键，产品核心差异化

### 第三周：学习闭环

5. 统计数据迁移至 SQLite（3-4 天）—— P0 数据安全项
6. 渐进式 AI 提示模式（3-5 天）—— 教学场景核心特性

### 第四周：复习系统

7. 错题本间隔复习系统（3-5 天）—— 学习闭环的最后一环

---

## 与其他改进项的关系

以上 7 项改进完成后，将直接推动以下成熟度维度升级：

| 维度       | 当前 -> 预期 | 推动因素                                  |
| ---------- | ------------ | ----------------------------------------- |
| AI 能力    | L1 -> L2     | 改进项 #2（上下文感知）+ #4（渐进式提示） |
| 用户体验   | L1 -> L2     | 改进项 #2（引导流程）+ #5（数据不丢失）   |
| 功能完整度 | L2 -> L2+    | 改进项 #6（间隔复习）+ #4（提示模式）     |
| 可维护性   | L2 -> L3     | 改进项 #7（代码清理）                     |
| 安全性     | 部分修复     | 改进项 #3（沙箱化）                       |

---

## 未入选但值得关注的改进项

以下改进项 ROI 不低，但因依赖关系或工时较长未纳入本冲刺：

| 改进项              | 优先级 | ROI  | 未入选原因                         |
| ------------------- | ------ | ---- | ---------------------------------- |
| 题库扩充至 500+     | P2     | 2.50 | 内容生产工时长，可并行进行         |
| 多 AI Provider 支持 | P2     | 2.00 | 需测试多个 API 兼容性              |
| 知识库向量嵌入 RAG  | P2     | 1.75 | 需引入 embedding 模型依赖          |
| TypeScript 严格模式 | P1     | 1.50 | 影响面广，需全量类型修复           |
| E2E 测试框架        | P2     | 1.33 | 需选型 + 基础设施搭建              |
| 依赖 CVE 升级       | P0     | 1.50 | vitest v4 大版本升级，需验证兼容性 |

---

> 结论：本冲刺的 7 项改进覆盖了 P0 安全修复、P1 用户体验、P2 产品差异化三个层次，总投入约 3-4 周全职工作量。完成后，CodeHelper 将从 L2 MVP 稳固升级至 L2+ 水平，AI 能力和用户体验两个最弱维度（L1）均有望达到 L2，产品核心价值闭环（刷题 -> AI 辅导 -> 错题复习 -> 数据追踪）基本成型。
