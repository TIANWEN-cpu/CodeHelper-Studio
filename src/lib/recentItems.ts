// recentItems.ts
// 命令面板「最近访问」的轻量持久化：只存 {kind,id} 引用，标题等显示信息
// 在面板渲染时用已加载的课程/练习/知识库数据现解析。localStorage 存储，
// 按 kind+id 去重、最新置顶、限长。

export type RecentKind = 'lesson' | 'exercise' | 'knowledge'

export interface RecentRef {
  kind: RecentKind
  id: string
}

const STORAGE_KEY = 'codehelper.recentItems'
const MAX_RECENTS = 8

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

function isRecentRef(value: unknown): value is RecentRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as Record<string, unknown>
  return (
    (ref.kind === 'lesson' || ref.kind === 'exercise' || ref.kind === 'knowledge') &&
    typeof ref.id === 'string'
  )
}

/** 读取最近访问引用（最新在前）。解析失败返回空数组。 */
export function getRecentRefs(): RecentRef[] {
  if (!hasWindow()) return []
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentRef).slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

/** 记录一次访问：去重后置顶，限长 MAX_RECENTS。 */
export function recordRecent(ref: RecentRef): void {
  if (!hasWindow() || !isRecentRef(ref)) return
  const next = [
    ref,
    ...getRecentRefs().filter((r) => !(r.kind === ref.kind && r.id === ref.id)),
  ].slice(0, MAX_RECENTS)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 最近访问是便利功能，存储不可用时静默降级 */
  }
}
