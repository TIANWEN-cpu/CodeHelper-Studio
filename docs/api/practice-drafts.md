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
- `title` 在新草稿中保存当前题目标题；旧记录更新时省略或传入 `undefined` 会保留原值，显式 `null` 才会清空。
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
  title?: string | null
}
```

`title` 的三态语义在 Renderer、IPC、SQLite 和浏览器开发 Mock 中一致：字符串写入标题，`null` 明确清空，省略或 `undefined` 在更新时保留现有标题；省略标题创建新记录时初始值为 `null`。同一 `baseRevision` 的网络重试若代码、语言及调用方声明的标题语义均与已提交版本一致，会返回原 `saved` 结果而不会再次递增 revision。

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
3. 切题和卸载使用 `flush()` 追赶到调用期间产生的最新本地版本；若旧题只写入恢复区，切到新题后仍保留独立的降级状态和可见提示，不能由新题的干净状态覆盖。
4. 普通写入错误保留 dirty 状态，不进行无限定时重试；下一次编辑或显式 flush 可重试。
5. revision 冲突进入稳定状态，不自动采用远端 revision 覆盖。

## 恢复与冲突

恢复区 v2 保存 `code`、`language`、`baseRevision`、`localVersion` 和 `updatedAt`，并限制条目数与总字符数。新写入使用 `codehelper-practice-draft-recovery-v2.session.boot-<app-boot>--renderer-<renderer>`，每个 Renderer 维护独立 map；旧的无 boot scope session、共享 v2 map 和 v1 code-only map 仍会读取，匹配内容首次写入当前 session 后再原地清理旧条目。

读取 v1 code-only map 时会校验原始 JSON、根结构以及全部条目。语法、结构或任一条目损坏时，原始字符串会逐字备份到内容寻址且跨重启稳定的 `codehelper-practice-draft-recovery-v1.corrupt.<fingerprint>` 键，读取结果返回“恢复已降级”错误；同一 map 中仍有效的条目继续作为候选返回。损坏的 v1 原键不会被清理或由新草稿覆盖，新编辑隔离写入当前 Renderer 的 v2 session；只有完整有效的 v1 map 才沿用匹配条目迁移与清理流程。

启动恢复会聚合同一练习的所有窗口候选：相同 snapshot/base revision 的候选去重；候选分叉时进入显式冲突，不按时间戳静默覆盖。未被选中的候选会转换为普通 `localOnly` 恢复文件，文件名包含窗口 source fingerprint；若标签容量不足，UI 会明确说明候选仍保留在恢复区。SQLite 保存成功只清理与已保存 snapshot 匹配的 source keys。同一 app boot 中其他 Renderer 的 map 始终只读，避免清理与对方新写入交错后覆盖整张 map；重启后旧 boot 已无存活 owner，才会安全清理匹配条目。其他窗口的分叉候选始终保留。

旧恢复数据按以下规则处理：

- 数据库无记录：按 revision 0 导入。
- 与数据库内容一致：视为 SQLite 已提交但恢复区未清场，删除恢复副本。
- 与数据库内容不同或已有 tombstone：显示冲突，不自动覆盖。

冲突时编辑器状态栏提供两个动作：重新加载已保存版本，或明确保留本地草稿并基于当前远端 revision 创建下一版本。

关闭活动练习标签前会先强制 flush；切题后变成非活动标签的 recovery-only / conflict 状态仍按 exercise 保留，关闭该旧标签时同样会查询并确认。结果仅达到恢复区，或仍存在 revision 冲突时，必须经过单独确认才会继续关闭；普通 SQLite 写入失败明确说明“最新内容仅保存在本地恢复区”，revision 冲突则明确要求之后重新打开并选择冲突版本，不会把冲突伪装成数据库不可用。数据库和恢复区都无法保存时不提供降级关闭，标签与内存内容保持打开。

`codehelper-practice-session-v1` 只记录最近一次显式打开的练习，作为旧版本/无标签拓扑时的入口 fallback，不是草稿或标签状态的事实来源。关闭最后一个练习标签时，Renderer 会在提交标签关闭 mutation 前可靠删除该 key；删除失败时标签保持打开，并在练习面板和 toast 中明确显示失败。成功删除后，切换主页面、重新挂载练习组件或重启应用都保持题库列表和 SQLite 的 closed topology，不会由旧 session 自动重开。点击最近关闭或从题库重新选择仍会写入新的 session 并显式打开标签；session 写入失败不会撤销已经打开的权威标签，但 UI 会明确说明重启恢复将以工作区拓扑为准。跨窗口关闭会把 fallback 更新到剩余的打开练习；没有剩余练习时清除 fallback，写入失败的窗口保留 local-only 标签而不伪装关闭成功。

## 验收

`tests/exerciseDraftElectron.test.ts` 启动真实 Electron 进程，使用 Electron ABI 的 `better-sqlite3` 验证旧表迁移后编辑仍保留标题、新草稿标题持久化、幂等重试、数据库关闭重开、CAS 冲突和 tombstone 防复活。Renderer service、全局练习 session、IPC 与浏览器开发 Mock 另有定向单元测试；`tests/e2e/data-loss.spec.ts` 还覆盖跨窗口关闭当前练习、异常应用退出与 renderer-only crash 后的恢复路径。
