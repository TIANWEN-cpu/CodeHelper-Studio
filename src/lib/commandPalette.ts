// commandPalette.ts
// 命令面板的纯搜索逻辑：把「页面 / 课程 / 练习」合并为统一结果列表。
// 抽成纯函数便于单测；UI（Header）只负责取数据与渲染。

import type { ViewType } from '@/types'
import type { DeepLinkTarget } from '@/lib/deepLink'

export type CommandKind = 'page' | 'lesson' | 'exercise'

export interface CommandResult {
  /** 列表唯一 key（含 kind 前缀，避免跨组撞 id）。 */
  key: string
  kind: CommandKind
  label: string
  sublabel?: string
  /** 选中后要跳转到的视图。 */
  view: ViewType
  /** 课程/练习的深链目标；页面项为空。 */
  target?: DeepLinkTarget
}

export interface PageItem {
  view: ViewType
  label: string
}

export interface LessonItem {
  id: string
  title: string
  trackTitle?: string
  moduleTitle?: string
}

export interface ExerciseItem {
  id: string
  title: string
  difficulty?: string
  trackId?: string
}

export interface CommandSources {
  pages: PageItem[]
  lessons?: LessonItem[]
  exercises?: ExerciseItem[]
}

/** 每个内容分组最多展示的条数，避免长列表淹没页面项。 */
export const MAX_PER_GROUP = 6

function matches(haystack: string | undefined, q: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(q)
}

/**
 * 根据查询词构建合并后的结果列表。
 * 空查询：仅返回页面项（与原「快速跳转」行为一致）。
 * 非空：页面 → 课程 → 练习 依次排列，每个内容分组最多 MAX_PER_GROUP 条。
 */
export function buildCommandResults(query: string, sources: CommandSources): CommandResult[] {
  const q = query.trim().toLowerCase()

  const pageResults: CommandResult[] = (
    q ? sources.pages.filter((p) => matches(p.label, q)) : sources.pages
  ).map((p) => ({ key: `page:${p.view}`, kind: 'page', label: p.label, view: p.view }))

  if (!q) return pageResults

  const lessonResults: CommandResult[] = (sources.lessons ?? [])
    .filter((l) => matches(l.title, q))
    .slice(0, MAX_PER_GROUP)
    .map((l) => ({
      key: `lesson:${l.id}`,
      kind: 'lesson',
      label: l.title,
      sublabel: [l.trackTitle, l.moduleTitle].filter(Boolean).join(' · ') || undefined,
      view: 'learn',
      target: { kind: 'lesson', id: l.id },
    }))

  const exerciseResults: CommandResult[] = (sources.exercises ?? [])
    .filter((e) => matches(e.title, q))
    .slice(0, MAX_PER_GROUP)
    .map((e) => ({
      key: `exercise:${e.id}`,
      kind: 'exercise',
      label: e.title,
      sublabel: [e.difficulty, e.trackId].filter(Boolean).join(' · ') || undefined,
      view: 'practice',
      target: { kind: 'exercise', id: e.id },
    }))

  return [...pageResults, ...lessonResults, ...exerciseResults]
}
