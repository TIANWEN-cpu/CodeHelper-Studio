# CodeHelper 假功能全面审查与自动修复计划

> 分支：`fusion/real-functionality-audit`  
> 检查点：`f32b781 Checkpoint verified fusion state before fake-function audit`  
> 执行原则：前端展示不能是假功能；能接真实后端就接真实后端；暂时做不了的入口要删掉或改成诚实状态；每批修复后运行 lint/build，必要时启动 Electron 验证；重要批次提交 Git 检查点。

## 已完成基线

- 多语言假功能已删除：SettingsView 不再保留 English/语言切换占位。
- 练习↔工作区闭环已打通：PracticeView 选题后 WorkspaceView 使用当前 exercise 的 starter/draft，提交走 `exercises-evaluate`，不再打到 `problems[0]`。
- 命令入口语义修正：不再伪装为搜索课程/题目/知识点，改为命令终端/页面命令入口。
- AI Tutor 右侧面板已协调化：不再小屏绝对覆盖主内容，视觉改为内置右侧工具面板。
- 已通过 lint/build/Electron 冷启动验证，并提交检查点 `f32b781`。

## 已完成本轮修复

- ReviewView 第一批真实化完成：筛选、重置、tab 内容、删除错题、正确代码展示、重新练习、本地规则复盘、SM-2 复习按钮语义均已接真实状态或真实 IPC；已通过 lint/build/Electron 冷启动验证，并提交 `e76efe6`。
- KnowledgeView 真实化完成：删除假下拉、收藏、回收站、最近访问清空等无后端支撑入口；搜索明确为关键词匹配；文档/片段点击显示真实元数据或检索片段；上传、删除、筛选、排序、视图切换接真实状态；已通过 lint/build/Electron 冷启动验证，并提交 `512bae9`。
- LearnView 搜索与底部面板清理完成：课程搜索接 `lessons-search` 与本地 track/module/lesson 过滤；删除无真实内容的章节练习/运行结果/讨论 tab，仅保留真实笔记；已通过 lint/build/Electron 冷启动验证，并提交 `8d8edac`。
- SettingsView 占位 tab 清理完成：删除仅显示“后续版本”的编辑器/快捷键 tab，只保留已接真实行为的设置页；已通过 lint/build/Electron 冷启动验证，并提交 `2d64839`。

## 已完成本轮修复

- ReviewView 第一批真实化完成：筛选、重置、tab 内容、删除错题、正确代码展示、重新练习、本地规则复盘、SM-2 复习按钮语义均已接真实状态或真实 IPC；已通过 lint/build/Electron 冷启动验证，并提交 `e76efe6`。
- KnowledgeView 真实化完成：删除假下拉、收藏、回收站、最近访问清空等无后端支撑入口；搜索明确为关键词匹配；文档/片段点击显示真实元数据或检索片段；上传、删除、筛选、排序、视图切换接真实状态；已通过 lint/build/Electron 冷启动验证，并提交 `512bae9`。
- LearnView 搜索与底部面板清理完成：课程搜索接 `lessons-search` 与本地 track/module/lesson 过滤；删除无真实内容的章节练习/运行结果/讨论 tab，仅保留真实笔记；已通过 lint/build/Electron 冷启动验证，并提交 `8d8edac`。
- SettingsView 占位 tab 清理完成：删除仅显示“后续版本”的编辑器/快捷键 tab，只保留已接真实行为的设置页；已通过 lint/build/Electron 冷启动验证，并提交 `2d64839`。

## 已完成本轮修复

- ReviewView 第一批真实化完成：筛选、重置、tab 内容、删除错题、正确代码展示、重新练习、本地规则复盘、SM-2 复习按钮语义均已接真实状态或真实 IPC；已通过 lint/build/Electron 冷启动验证，并提交 `e76efe6`。
- KnowledgeView 真实化完成：删除假下拉、收藏、回收站、最近访问清空等无后端支撑入口；搜索明确为关键词匹配；文档/片段点击显示真实元数据或检索片段；上传、删除、筛选、排序、视图切换接真实状态；已通过 lint/build/Electron 冷启动验证，并提交 `512bae9`。
- LearnView 搜索与底部面板清理完成：课程搜索接 `lessons-search` 与本地 track/module/lesson 过滤；删除无真实内容的章节练习/运行结果/讨论 tab，仅保留真实笔记；已通过 lint/build/Electron 冷启动验证，并提交 `8d8edac`。
- SettingsView 占位 tab 清理完成：删除仅显示“后续版本”的编辑器/快捷键 tab，只保留已接真实行为的设置页；已通过 lint/build/Electron 冷启动验证，并提交 `2d64839`。

## 已完成本轮修复

- ReviewView 第一批真实化完成：筛选/重置/tab/删除/正确代码展示/重新练习/本地规则复盘/SM-2 复习按钮语义均已接真实状态或真实 IPC；已验证并提交 `e76efe6`。
- KnowledgeView 真实化完成：删除收藏、回收站、最近访问清空、假下拉等无后端支撑入口；搜索明确为关键词匹配；文档/片段点击显示真实元数据或检索片段；上传/删除/筛选/排序/视图切换接真实状态；已验证并提交 `512bae9`。
- LearnView 搜索与底部面板清理完成：课程搜索接 `lessons-search` 与本地 track/module/lesson 过滤；删除无真实内容的章节练习/运行结果/讨论 tab，仅保留真实笔记；已验证并提交 `8d8edac`。
- SettingsView 占位 tab 清理完成：删除仅显示“后续版本”的编辑器/快捷键 tab，只保留已接真实行为的设置页；已验证并提交 `2d64839`。

## 第一轮审查发现

### P0 - ReviewView 假功能/断裂功能

文件：`src/views/ReviewView.tsx`、`src/hooks/useReviewData.ts`、`src/services/reviewService.ts`、`electron/ipc/mistakes.ts`、`electron/ipc/review.ts`

1. 筛选 UI 是假的：状态/难度/标签/错误类型 4 个 select 只有 option，没有 value/onChange，没有调用 `setFilters`。
2. “重置”按钮无 onClick。
3. 内容 tab 是假的：`activeTab` 会改变，但主体始终显示题目描述/错误代码/错误结果，不根据 tab 渲染不同内容。
4. “AI 复盘建议”是假生成：`handleAiAnalysis` 只是把 `selected.ai_analysis ?? 'AI 分析生成中...'` 写回数据库，没有调用真实 AI，也没有基于错题内容生成分析。
5. “加入复习计划”文案不准确：实际 `updateReview(problem_id, 3)` 是完成一次复习并推进 SM-2，不是加入计划。
6. “重新练习”按钮无动作。
7. “查看正确代码”按钮无动作。
8. 右侧“同类推荐练习”点击 `selectMistake(review.exercise_id)`，但 `selectMistake` 需要 mistake id，exercise_id/problem_id 不匹配，点击会查错/失败。
9. “知识点”标签只显示，不可跳转/筛选；短期应改为本页筛选标签或诚实展示。

修复策略：

- 第一批：把 ReviewView 现有 UI 接成真实可用：筛选、重置、tab 内容切换、删除错题、正确代码展示、AI 分析改为本地规则生成（先不伪装远程 AI），复习按钮文案改为真实语义。
- 后续批：若 AI 配置可用，再把 AI 复盘接入 `ai-chat` / 默认 AI config；若无模型则规则分析作为真实降级。

### P1 - KnowledgeView / RAG 假功能与空实现

文件：`src/views/KnowledgeView.tsx`、`src/services/knowledgeService.ts`、`electron/ipc/rag.ts`

1. `knowledge-semantic-search` 实际是关键词降级，UI 若叫“语义搜索”必须说明降级，或改叫关键词/智能检索。
2. `knowledge-auto-tag`、`knowledge-tag-documents` 返回空数组，是后端空实现；前端若展示收藏/标签/图谱入口必须删除或诚实禁用。
3. 文档卡片若只有 cursor 但不能打开详情，需要改成可查看文档片段/删除/检索结果定位，或去掉假点击。

### P1 - LearnView 假/半假功能

文件：`src/views/LearnView.tsx`、`src/hooks/useLearnData.ts`、`src/services/learnService.ts`

1. 左侧搜索框写“搜索课程、章节、知识点”，需要确认是否真实过滤；若无逻辑则接 `lessons-search` 或本地 tracks 过滤。
2. Console tabs（exercise/output/discussion 等）需审查是否切换真实内容；空 tab 要删或改诚实。
3. `marked` 类型处理需要保持 lint 通过，不影响功能。

### P2 - SettingsView 占位 tab

文件：`src/views/SettingsView.tsx`

1. “编辑器”tab 仍是后续版本占位。
2. “快捷键”tab 仍是后续版本占位。

修复策略：能接真实设置就接真实设置；不能接的 tab 应删除或改成只显示已真实生效的设置。

## 执行顺序

1. ReviewView 第一批真实化（筛选、tab、AI 规则复盘、按钮语义/动作）→ lint/build → 启动验证 → commit。
2. KnowledgeView：删除/诚实化空实现入口，接真实 keyword/semantic 降级说明，文档点击详情 → lint/build → commit。
3. LearnView：接真实搜索，处理空 tab → lint/build → commit。
4. SettingsView：删除或接通编辑器/快捷键占位 → lint/build → commit。
5. 最终全量 cold start 验证并更新记忆。
