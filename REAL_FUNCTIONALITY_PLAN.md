# CodeHelper 假功能全面审查与修复计划

> 分支：`fusion/real-functionality-audit`
> 基线检查点：`f32b781 Checkpoint verified fusion state before fake-function audit`
> 执行原则：前端展示不能是假功能；能接真实后端/真实生效就接真实；暂时做不了的入口删除或改成诚实状态，不留假开关（沿用"多语言做不了就删"先例）；每批 lint/build + Electron 冷启动验证；重要批次提交 Git 检查点。

## 第一轮（已完成并验证）

- ReviewView 真实化 `e76efe6`：筛选/重置/tab/删除错题/正确代码/重新练习/本地规则复盘/SM-2 复习按钮接真实状态或 IPC。
- KnowledgeView 真实化 `512bae9`：删假下拉/收藏/回收站/最近访问；搜索明确为 `knowledge-search` 关键词；文档/片段点击只展示真实元数据；上传/删除/筛选/排序/视图切换接真实状态。
- LearnView 真实化 `8d8edac`：课程搜索接 `lessons-search` + 本地过滤；删无内容的章节练习/运行结果/讨论 tab，仅保留真实笔记。
- SettingsView 占位 tab 清理 `2d64839`：删"编辑器""快捷键"后续版本占位 tab。

## 第二轮（已完成并验证）

### 装饰性假 UI 清理 `ea5e877`

- **WorkspaceView**：删除不存在的文件树（utils.py/**init**.py/test\_\*.py）、大纲/时间线/Settings2 装饰、假编辑器 tab（test/README）、3 个无动作工具栏按钮、终端假 tab（输出/问题/控制台）+ 写死的"问题 2"badge、状态栏写死的 "Python 3.10.8 (venv)/Spaces/UTF-8"；顶部 Play 接真实 `handleRun`，状态栏改真实行数。
- **AITutorPanel**：placeholder"输入 / 选择操作"原是空头承诺（无 `/` 逻辑）；现实现真实的 `/` 快捷操作选择器，复用真实 presets/quickActions，输入 `/` 弹出可选列表、回车或点击执行。
- **PracticeView**：题目描述/提示 tab 原为装饰（点击无效、提示恒平铺），改为真实的内容切换 + 选题重置。
- **HomeView**：错题复习提醒卡片原先标题用真实 `reviewReminders.length`，主体却恒显示"今天还没有错题"；改为有待复习项时渲染真实列表（优先级 + 到期时间，点击跳转复习），无项才显示空状态。
- ProfileView 复审：完全真实（overview/summary 真加载、活跃度柱状图、活动构成、成就由真实指标推导），无需改动。

### 设置页诚实化 `81c5060`

根因：9 个开关（show_ai_panel/show_bottom_panel/compact_sidebar/double_line_tabs/glass_effect/high_contrast/code_theme/region_format/week_start）持久化到 DB 但**全代码库无消费方**（grep 确认），是"存了不生效"的假开关。

- **接通为真**：`glass_effect`、`high_contrast` → appearance.ts 写 `data-glass`/`data-contrast` 属性 + index.css 规则（禁用 backdrop-blur / 调亮边框文字），启动 `applyAll` + 实时 `handleToggle` 均生效，与已验证的 `reduce_motion` 同机制。
- **删除假入口**：代码主题卡片（编辑器是纯 textarea 无语法高亮引擎，picker/预览/"在编辑器中预览"按钮均无效）；animations（与 reduce_motion 重复）；布局卡片 4 项（show_ai_panel/show_bottom_panel/compact_sidebar/double_line_tabs，需侵入式 store 接线且本就有侧边栏/面板直接控件）；语言与区域卡片（region_format 单选项无意义、week_start 未接日期逻辑）。
- 主题色"+"按钮：原无动作 → 改为真实原生颜色选择器（`<input type=color>`）。
- "数据与同步" tab → "数据"（无云同步后端）。

设置页现存项均已验证真实生效：主题模式、跟随系统、主题色（含自定义）、界面缩放、字体大小、毛玻璃、高对比度、减少动态效果、AI 模型配置、数据导出/导入、关于（真实 platformInfo）。

## 第三轮（"全部实现为真" + 收尾全局复扫，已完成并验证）

用户裁定：第二轮被删的开关一律"全部实现为真"（含引入语法高亮引擎），不接受删除；随后"收尾 + 全局复扫"。

- 布局开关真实化 `8f91567`：紧凑侧边栏 / 显示 AI 面板 / 显示底部面板 / 双行标签接入全局 store（新增状态 + setter + 启动 `hydrateLayout` 读回持久化），并真实驱动 Sidebar 折叠、WorkspaceView 底部面板初始态与编辑器标签单/双行；设置页重加"布局设置"卡片。
- 区域格式 / 每周起始日真实化 `b6784c3`：新增 `src/lib/locale.ts`（中文/ISO/英文 + `formatDate`）；store 新增 `dateRegion`/`weekStart`；**热力图重建**为按真实日期零填充、按 weekStart 对齐的 13 周 × 7 天网格（原为线性 48 格、稀疏不连续）；HomeView/ReviewView 日期改用 `formatDate`；设置页重加"语言与区域"卡片（多真实选项，替换原单选项伪选择）。
- 代码主题语法高亮引擎 `0fadac8`：工作区编辑器由纯 textarea 升级为 **CodeMirror 6**（`@uiw/react-codemirror` + lang-python/js + thememirror），保留行号/运行/提交/练习模式/语言；新增 `codeTheme` store + `src/lib/codeThemes.ts`（6 主题）；设置页重加"代码主题"卡片（含复用编辑器的只读实时预览），code_theme 真实换肤。
- 行为埋点接通 `580611f`（全局复扫最大发现）：`analytics_events` 唯一写入口 `analytics-track` 此前全项目从未调用 → 首页活动/热力图/连续天数 + 由事件推导的 XP/等级恒空。新增 `analyticsService.track`，在 runCode/submitToProblem(accepted)/submitCode(passed)/markLessonCompleted/sendMessage 五处真实动作埋点；`getRecentActivity` 重写为中文动作描述（不再展示英文枚举）；HomeView 活动图标/状态/跳转按真实事件类型键控。顺带删除死代码 `getQuickLinks`。
- ReviewView 真实排序 `e3cf0f5`：错题列表"最近复习 ▾"伪装可排序的静态 span 改为真实 `<select>`（最近/最早添加、错误类型多）+ `sortedMistakes` 真实排序。
- LearnView 诚实化 `fd228bf`：移除搜索框内误导性的 `Ctrl K` 角标（Ctrl+K 实为 Header 全局命令面板快捷键，与该输入无关）。

全局交叉复扫（3 个只读子代理覆盖全部视图/布局/AI 组件）结论：除上述两处（HomeView 活动展示、ReviewView 伪排序）外，其余交互/展示均可追溯到真实 service/IPC/store/hook；上述均已修复。每批 lint + build + Electron 冷启动验证（80 通道 / ready-to-show / did-finish-load / 零渲染层错误）；后端 analytics IPC 测试 24/24 通过。

## 后续可选（非"假功能"，属能力增强）

- ReviewView 复盘目前是本地规则降级；如默认 AI config 可用可升级为真实 `ai-chat`。
- Knowledge/RAG 的语义/向量检索、自动标签、概念图谱需后端真实实现后再暴露入口。
- 真正的全局搜索若要做，应作为独立功能，不混入命令面板。
- 埋点的 `event_data` 目前仅 code_run 带 language；problem_solved/lesson_completed 可进一步带题目/课程标题以丰富活动详情（需 service 层透传 title）。
