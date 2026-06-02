# 数据可移植性 (Data Portability)

## 概述

CodeHelper 支持将所有用户数据导出为 JSON 格式，也支持从 JSON 文件导入数据。这使得用户可以：

- 备份和恢复数据
- 在不同设备间迁移数据
- 与他人分享题目和知识库

## 支持的数据类别

| 类别             | 说明       | 表名             |
| ---------------- | ---------- | ---------------- |
| problems         | 题目       | problems         |
| submissions      | 提交记录   | submissions      |
| mistakes         | 错题记录   | mistakes         |
| chat_sessions    | 对话会话   | chat_sessions    |
| chat_history     | 对话历史   | chat_history     |
| knowledge_docs   | 知识文档   | knowledge_docs   |
| knowledge_chunks | 知识分块   | knowledge_chunks |
| settings         | 设置项     | settings         |
| memories         | 长期记忆   | memories         |
| prompt_presets   | 预设提示词 | prompt_presets   |

## 导出格式

导出的 JSON 文件遵循以下格式：

```json
{
  "version": 1,
  "exportedAt": "2026-06-02T12:00:00.000Z",
  "problems": [...],
  "submissions": [...],
  "mistakes": [...],
  "chat_sessions": [...],
  "chat_history": [...],
  "knowledge_docs": [...],
  "knowledge_chunks": [...],
  "settings": [...],
  "memories": [...],
  "prompt_presets": [...]
}
```

每个字段都是可选的，只包含用户选择导出的类别。

## 导入冲突策略

导入时如果数据库中已存在相同记录（基于主键或唯一键），可选择以下策略：

- **跳过 (skip)**: 已存在的记录保持不变，只导入新记录。
- **合并 (merge)**: 已存在的记录会被更新为导入文件中的数据。
- **覆盖 (overwrite)**: 已存在的记录会被删除后重新插入。

## 使用方法

### 通过设置界面

1. 打开「设置」页面
2. 点击「导出/导入」标签页
3. 勾选要导出/导入的数据类别
4. 选择导入冲突策略（仅导入时生效）
5. 点击「导出数据」或「导入数据」按钮
6. 在文件对话框中选择保存/打开路径

### 通过 IPC 调用（开发者）

```typescript
// 导出
const result = await typedInvoke('export-data', ['problems', 'memories'])

// 导入
const result = await typedInvoke('import-data', {
  conflictResolution: 'skip',
  selectedData: ['problems', 'memories'],
})

// 获取各类别记录数量
const counts = await typedInvoke('export-get-counts')
```

## IPC 通道

| 通道                    | 参数                                        | 返回值                           |
| ----------------------- | ------------------------------------------- | -------------------------------- |
| `export-data`           | `categories: string[]`                      | `{ success, filePath?, error? }` |
| `export-data-to-path`   | `categories: string[], filePath: string`    | `{ success, filePath?, error? }` |
| `import-data`           | `options?: ImportOptions`                   | `ImportResult`                   |
| `import-data-from-path` | `filePath: string, options?: ImportOptions` | `ImportResult`                   |
| `export-get-counts`     | (无)                                        | `Record<string, number>`         |

## 数据验证

导入时会对 JSON 数据进行以下验证：

1. 文件必须是有效的 JSON 格式
2. 必须包含 `version`（数字）和 `exportedAt`（字符串）字段
3. 每个数据类别必须是数组
4. 数组中的每个元素必须是对象
5. 缺少的列会被自动过滤，不会导致导入失败

## 注意事项

- 导出的 JSON 文件可能较大，取决于数据量
- API Key 等敏感信息会被包含在导出文件中，请妥善保管
- 导入操作在单个事务中执行，如果出现错误会回滚
- 建议在导入前先备份当前数据

## 文件路径

- 前端组件: `src/modules/settings/ExportImport.tsx`
- 后端处理: `electron/ipc/export.ts`
- IPC 类型定义: `src/types/ipc.ts`
- Preload 白名单: `electron/preload.ts`
