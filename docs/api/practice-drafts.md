# 练习草稿契约

练习草稿同时保存在 SQLite 和渲染进程恢复区中。SQLite 是持久化事实来源；恢复区只用于覆盖“编辑后立即关闭窗口、IPC 尚未完成”的崩溃窗口。

## 草稿记录

```typescript
interface PracticeDraft {
  exerciseId: string
  title: string | null
  code: string
  language: string | null
  revision: number
  updatedAt: string
  deleted: boolean
}
```

- `revision` 从 1 开始，每次保存或清除成功后递增。
- `language` 与代码一起保存；旧数据库迁移记录允许为 `null`，渲染层回退到题目首选语言。
- `deleted` 是清除草稿后的 tombstone。记录不会直接物理删除，避免旧窗口以 `baseRevision: 0` 重新插入已清除内容。

## IPC

`exercises-draft-get` 返回 `PracticeDraft | null`。

`exercises-draft-save` 接收：

```typescript
interface SaveDraftInput {
  exerciseId: string
  code: string
  language: string
  baseRevision: number
}
```

`exercises-draft-clear` 接收 `{ exerciseId, baseRevision }`。

保存和清除返回判别联合：

```typescript
type DraftMutationResult =
  | { status: 'saved'; draft: PracticeDraft }
  | { status: 'conflict'; current: PracticeDraft | null }
```

数据库只在当前 revision 等于 `baseRevision` 时修改记录。冲突属于正常业务结果，不通过自定义 Error 属性跨 IPC 传递。

## 自动保存

`DraftAutosaveCoordinator` 使用单 worker 串行保存：

1. 保存期间发生的新编辑继续留在同一个 exercise session。
2. 前一写入返回新 revision 后，worker 再用该 revision 保存最新快照。
3. 切题和卸载使用 `flush()` 追赶到调用期间产生的最新本地版本。
4. 普通写入错误保留 dirty 状态，不进行无限定时重试；下一次编辑或显式 flush 可重试。
5. revision 冲突进入稳定状态，不自动采用远端 revision 覆盖。

## 恢复与冲突

恢复区 v2 保存 `code`、`language`、`baseRevision`、`localVersion` 和 `updatedAt`，并限制条目数与总字符数。旧 v1 code-only 数据按以下规则处理：

- 数据库无记录：按 revision 0 导入。
- 与数据库内容一致：视为 SQLite 已提交但恢复区未清场，删除恢复副本。
- 与数据库内容不同或已有 tombstone：显示冲突，不自动覆盖。

冲突时编辑器状态栏提供两个动作：重新加载已保存版本，或明确保留本地草稿并基于当前远端 revision 创建下一版本。

## 验收

`tests/exerciseDraftElectron.test.ts` 启动真实 Electron 进程，使用 Electron ABI 的 `better-sqlite3` 验证旧表迁移、数据库关闭重开、CAS 冲突和 tombstone 防复活。
