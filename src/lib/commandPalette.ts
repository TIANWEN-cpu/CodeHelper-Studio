// commandPalette.ts
// 命令面板的纯搜索逻辑：把「页面 / 课程 / 练习 / 知识库」合并为统一结果列表，
// 并在空查询时解析「最近访问」。抽成纯函数便于单测；UI（Header）只负责取数据与渲染。

import type { ViewType } from '@/types'
import type { DeepLinkTarget } from '@/lib/deepLink'
import type { RecentRef } from '@/lib/recentItems'

export type CommandKind = 'page' | 'lesson' | 'exercise' | 'knowledge'

export interface CommandResult {
  /** 列表唯一 key（含 kind 前缀，避免跨组撞 id）。 */
  key: string
  kind: CommandKind
  label: string
  sublabel?: string
  /** 选中后要跳转到的视图。 */
  view: ViewType
  /** 课程/练习/知识库的深链目标；页面项为空。 */
  target?: DeepLinkTarget
  /** 右侧徽标覆盖（如「最近」）；缺省时按 kind 显示。 */
  badge?: string
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

export interface KnowledgeItem {
  id: string
  title: string
  sublabel?: string
}

export interface CommandSources {
  pages: PageItem[]
  lessons?: LessonItem[]
  exercises?: ExerciseItem[]
  knowledge?: KnowledgeItem[]
  /** 最近访问引用；仅在空查询时解析展示。 */
  recentRefs?: RecentRef[]
}

/** 每个内容分组最多展示的条数，避免长列表淹没页面项。 */
export const MAX_PER_GROUP = 6
/** 空查询时最近访问最多展示的条数。 */
export const MAX_RECENTS = 5

function matches(haystack: string | undefined, q: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(q)
}

function pageResult(p: PageItem): CommandResult {
  return { key: `page:${p.view}`, kind: 'page', label: p.label, view: p.view }
}

function lessonResult(l: LessonItem): CommandResult {
  return {
    key: `lesson:${l.id}`,
    kind: 'lesson',
    label: l.title,
    sublabel: [l.trackTitle, l.moduleTitle].filter(Boolean).join(' · ') || undefined,
    view: 'learn',
    target: { kind: 'lesson', id: l.id },
  }
}

function exerciseResult(e: ExerciseItem): CommandResult {
  return {
    key: `exercise:${e.id}`,
    kind: 'exercise',
    label: e.title,
    sublabel: [e.difficulty, e.trackId].filter(Boolean).join(' · ') || undefined,
    view: 'practice',
    target: { kind: 'exercise', id: e.id },
  }
}

function knowledgeResult(k: KnowledgeItem): CommandResult {
  return {
    key: `knowledge:${k.id}`,
    kind: 'knowledge',
    label: k.title,
    sublabel: k.sublabel,
    view: 'knowledge',
    target: { kind: 'knowledge', id: k.id },
  }
}

/** 把最近访问引用解析为结果项（标题取自已加载内容；未加载/已删除的引用跳过）。 */
function resolveRecents(sources: CommandSources): CommandResult[] {
  const lessons = new Map((sources.lessons ?? []).map((l) => [l.id, l]))
  const exercises = new Map((sources.exercises ?? []).map((e) => [e.id, e]))
  const knowledge = new Map((sources.knowledge ?? []).map((k) => [k.id, k]))
  const out: CommandResult[] = []
  for (const ref of sources.recentRefs ?? []) {
    if (out.length >= MAX_RECENTS) break
    let result: CommandResult | undefined
    if (ref.kind === 'lesson') {
      const l = lessons.get(ref.id)
      if (l) result = lessonResult(l)
    } else if (ref.kind === 'exercise') {
      const e = exercises.get(ref.id)
      if (e) result = exerciseResult(e)
    } else if (ref.kind === 'knowledge') {
      const k = knowledge.get(ref.id)
      if (k) result = knowledgeResult(k)
    }
    if (result) out.push({ ...result, badge: '最近' })
  }
  return out
}

/**
 * 根据查询词构建合并后的结果列表。
 * 空查询：最近访问 → 页面（与原「快速跳转」行为兼容，并把最近用过的内容置顶）。
 * 非空：页面 → 课程 → 练习 → 知识库 依次排列，每个内容分组最多 MAX_PER_GROUP 条。
 */
export function buildCommandResults(query: string, sources: CommandSources): CommandResult[] {
  const q = query.trim().toLowerCase()

  const pages = (q ? sources.pages.filter((p) => matches(p.label, q)) : sources.pages).map(
    pageResult,
  )

  if (!q) return [...resolveRecents(sources), ...pages]

  const lessons = (sources.lessons ?? [])
    .filter((l) => matches(l.title, q))
    .slice(0, MAX_PER_GROUP)
    .map(lessonResult)

  const exercises = (sources.exercises ?? [])
    .filter((e) => matches(e.title, q))
    .slice(0, MAX_PER_GROUP)
    .map(exerciseResult)

  const knowledge = (sources.knowledge ?? [])
    .filter((k) => matches(k.title, q) || matches(k.sublabel, q))
    .slice(0, MAX_PER_GROUP)
    .map(knowledgeResult)

  return [...pages, ...lessons, ...exercises, ...knowledge]
}
