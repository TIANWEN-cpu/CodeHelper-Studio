# 知识库指南

CodeHelper 内置离线优先的知识库 RAG（检索增强生成）系统，支持导入本地文档、混合检索并把带来源的片段注入 AI 对话。

## 概览

知识库模块提供：

- 文档导入（支持 PDF、Markdown、TXT）
- 自动文本分块（约 500 字符/块）
- SQLite FTS5/BM25 关键词召回
- trigram 与本地字符 n-gram 语义近似
- 中英计算机术语扩展与 RRF 排名融合
- 明确显示检索后端、降级状态、命中通道和文档来源
- 按稳定分类键筛选，并展示来源仓库、路径、提交和标签
- 长文 H1-H6 目录、标题跳转和阅读进度指示
- 按源行展示链接审计状态，区分永久失效与临时网络错误

## 导入文档

### 资源包批次导入

CodeHelper 支持导入外部 `import-ready` 或 `import-batches` 资源包目录。推荐把大型第三方学习资料保留在项目外部，只按需导入到本地数据库，避免让应用仓库和安装包变大。

资源包目录需要包含以下任一子目录：

```text
knowledge-docs/
problems/
```

推荐导入顺序：

1. `01-core-cs-foundation`
2. `02-ai-deep-learning`
3. `03-interview-career`
4. `04-cs408-and-courses`
5. `00-problem-seeds`
6. `05-roadmap-and-bug-manual`
7. `07-language-specific`
8. `06-book-resource-indexes`

导入步骤：

1. 点击左侧栏的 **知识库** 图标。
2. 点击 **导入资源包**。
3. 选择某个批次目录，例如 `D:\coderhelperresource\import-batches\01-core-cs-foundation`。
4. 等待导入摘要出现。
5. 每导入一批后，先搜索几个关键词确认结果可用，再继续下一批。

重复导入同一批次时，已导入的知识文档会跳过；同名同来源题目会更新，不会重复创建。

### 支持的文件格式

| 格式     | 扩展名 | 最大大小 | 说明             |
| -------- | ------ | -------- | ---------------- |
| 文本文件 | `.txt` | 10 MB    | 纯文本格式       |
| Markdown | `.md`  | 10 MB    | Markdown 格式    |
| PDF      | `.pdf` | 10 MB    | 自动提取文本内容 |

### 导入步骤

1. 点击左侧栏的 **知识库** 图标
2. 点击 **导入文档** 按钮
3. 在弹出的文件选择对话框中选择文件（支持多选）
4. 系统自动处理文件：
   - 读取文件内容
   - 对于 PDF 文件，使用 `pdf-parse` 库提取文本
   - 将文本按约 500 字符自动分块
   - 从 front matter、文件名和导入上下文生成结构化 metadata
   - 在单一事务中保存正文、metadata 和分块
5. 导入完成后，文档出现在知识库列表中

### 文档列表

导入后的文档在知识库列表中展示：

- 文件名
- 显示标题
- 文件类型（txt / md / pdf）
- 分类、标签和来源仓库
- 分块数量
- 导入时间

分类使用稳定的 `category_key` 进行筛选，并以 `category_label` 显示。资源包 metadata 可提供 `source_repo`、`source_url`、`source_path`、`source_commit`、`generated_at` 和 `import_target`；手动上传的本地文件使用本地来源 fallback，不会伪造上游仓库信息。

### 阅读长文

打开文档后，Markdown 标题 H1-H6 会生成目录。目录项和正文标题使用同一套 slug 规则，因此带空格、标点、括号或 URL fragment 的标题仍可定位。阅读器顶部进度条会随当前滚动位置实时更新。

来源区展示可用的仓库、URL、源路径、提交和正文 SHA-256。链接状态来自只读审计记录：

- `reachable`：目标可访问
- `not_found`：已确认未找到
- `temporary_error`：超时、服务异常等临时失败，不能据此删除正文
- `restricted`：需要权限或被访问策略限制
- `malformed`：目标格式无效
- `unresolved_relative`：相对链接无法映射到已导入文档
- `unchecked`：尚无确定检查结果

## 检索文档

### 混合检索

1. 在知识库界面的搜索框中输入关键词
2. 系统并行执行 BM25、trigram 和本地 n-gram 相似度检索
3. 常见中英计算机术语会扩展，例如“二分搜索 / binary search”
4. 多路结果通过 Reciprocal Rank Fusion（RRF）融合
5. 结果按融合相关度排序，同一文档最多保留两个片段，避免单一来源挤占全部结果

### 检索机制

- 关键词通道：SQLite FTS5 `unicode61` + BM25
- 语义近似通道：FTS5 `trigram` + 本地字符 n-gram 相似度
- 融合方式：RRF、关键词覆盖率和本地相似度共同排序
- 结果限制：主界面单次最多返回 12 条结果
- 降级链：完整混合检索 -> 单 FTS 通道 + 本地重排 -> bounded LIKE + 本地重排
- Fail-honest：降级原因会显示在知识库界面，不会把 LIKE 回退伪装成向量检索

### 检索结果

每条检索结果包含：

- 匹配的文本片段（分块内容）
- 来源文件名
- 来源仓库、源文件路径和片段序号
- 融合相关度评分
- 命中通道（BM25 / 语义近似 / 降级召回）
- 可审计的命中说明

## 删除文档

- 在知识库列表中选择要删除的文档
- 点击删除按钮
- 文档、分块、metadata 和链接审计将按外键级联删除

批量治理不等同于界面中的单文档删除。正式维护流程必须经过 audit、dry-run、完整备份、apply 和 verify，并在维护 run/action 日志中保留删除 ID、原因、来源、保留文档和清理前后数量。临时网络错误不能作为删除正文的理由。具体操作见 [知识库维护指南](../guides/knowledge-maintenance.md)。

## 使用场景

### 学习笔记检索

将你的学习笔记、课程资料导入知识库，需要时快速检索相关内容：

- 编程语言教程
- 算法笔记
- 面试准备资料

### 代码文档检索

导入常用的技术文档，在编码时快速查阅：

- API 文档
- 框架使用指南
- 最佳实践文档

### 搭配 AI 使用

知识库检索结果可以作为 AI 对话的上下文参考：

1. 在 AI 对话中启用 RAG 上下文
2. 用户问题会触发同一套混合检索
3. 注入的每个片段包含 `filename#片段序号` 来源标签
4. AI 会优先依据这些本地资料回答；没有有效片段时不会注入空上下文

## 技术细节

### 文本分块算法

文本分块使用以下策略：

- 单文件上传默认块大小：约 500 字符
- 资源包导入默认块大小：约 1500 字符
- 在自然断点处分割（段落、句子边界）
- 保留分块的顺序索引信息
- 每个分块独立存储，支持精确检索

### 存储结构

知识库治理使用六张持久表：

- `knowledge_docs` - 存储文件名、类型、原始内容和分块计数
- `knowledge_chunks` - 存储文档分块，通过 `doc_id` 关联到文档
- `knowledge_doc_metadata` - 存储显示标题、分类、标签、来源和正文 SHA-256
- `knowledge_link_audit` - 存储按文档和源行定位的链接解析与检查结果
- `knowledge_maintenance_runs` - 存储计划、备份、报告和清理前后计数
- `knowledge_maintenance_actions` - 存储每条删除或 metadata 更新的理由与快照

删除 `knowledge_docs` 会级联删除对应 chunks、metadata 和 link audit。维护 actions 不直接外键关联文档，所以受审删除完成后，原因和来源快照仍可留档。FTS5 的 `knowledge_chunks_fts` 与 `knowledge_chunks_trigram` 是由 chunks trigger 同步的检索虚拟表，不替代以上持久治理记录。

### 评测与后续扩展

仓库内置固定检索评测集，并以 Recall@3 和 MRR 作为回归门槛。运行：

```bash
npm run test:knowledge-retrieval
```

`embedding` 字段继续保留给未来的模型向量后端。当前“语义近似”完全本地、确定性运行，不声称已经使用模型 embedding。

---

## See Also

- [快速开始](getting-started.md) -- 安装与首次配置
- [AI 对话指南](ai-chat-guide.md) -- 知识库在 AI 对话中的应用
- [API 参考 - 知识库](../api.md#知识库) -- 知识库 IPC 通道
- [术语表](../glossary.md) -- RAG、文本分块等术语
