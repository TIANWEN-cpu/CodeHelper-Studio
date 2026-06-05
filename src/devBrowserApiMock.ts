import courseMapData from '../content/metadata/course_map.json'
import exercisesData from '../content/metadata/exercises.json'
import agentTaskBriefMarkdown from '../content/ai_tutor/agent_task_brief.md?raw'
import debugDialogueMarkdown from '../content/ai_tutor/debug_dialogue.md?raw'
import learningLogAutomationMarkdown from '../content/ai_tutor/learning_log_automation.md?raw'
import promptingBasicsMarkdown from '../content/ai_tutor/prompting_basics.md?raw'
import socraticReviewMarkdown from '../content/ai_tutor/socratic_review.md?raw'
import studyPlanMarkdown from '../content/ai_tutor/study_plan.md?raw'
import toolSafetyChecklistMarkdown from '../content/ai_tutor/tool_safety_checklist.md?raw'
import workflowRetrospectiveMarkdown from '../content/ai_tutor/workflow_retrospective.md?raw'

type Listener = (...args: unknown[]) => void

const listeners = new Map<string, Set<Listener>>()
const courseMap = courseMapData as {
  tracks: Array<{
    id: string
    title: string
    summary: string
    modules: Array<{
      id: string
      title: string
      summary: string
      lessons: Array<{ id: string; title: string; summary: string; path: string; tags?: string[] }>
    }>
  }>
}
const exercises = exercisesData as {
  exercises: Array<{
    id: string
    title: string
    track_id: string
    difficulty: string
    prompt: string
    lesson_id?: string
    starter_code?: string
    hints?: string[]
  }>
}
const lessonMarkdownByPath: Record<string, string> = {
  'ai_tutor/agent_task_brief.md': agentTaskBriefMarkdown,
  'ai_tutor/debug_dialogue.md': debugDialogueMarkdown,
  'ai_tutor/learning_log_automation.md': learningLogAutomationMarkdown,
  'ai_tutor/prompting_basics.md': promptingBasicsMarkdown,
  'ai_tutor/socratic_review.md': socraticReviewMarkdown,
  'ai_tutor/study_plan.md': studyPlanMarkdown,
  'ai_tutor/tool_safety_checklist.md': toolSafetyChecklistMarkdown,
  'ai_tutor/workflow_retrospective.md': workflowRetrospectiveMarkdown,
}
const sessions = [
  {
    id: 'browser-session-1',
    title: '浏览器验证会话',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]
const messages: Record<
  string,
  Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }>
> = {
  'browser-session-1': [],
}

function cloneSession(session: (typeof sessions)[number]) {
  return { ...session }
}

function findLesson(lessonId: string) {
  for (const track of courseMap.tracks) {
    for (const module of track.modules) {
      for (const lesson of module.lessons) {
        if (lesson.id === lessonId) return { track, module, lesson }
      }
    }
  }
  return null
}

function lessonProgress(trackId: string) {
  const track = courseMap.tracks.find((item) => item.id === trackId)
  if (!track) return []
  return track.modules.flatMap((module) =>
    module.lessons.map((lesson) => ({
      lesson_id: lesson.id,
      status: 'not_started',
      completed: false,
    })),
  )
}

function searchLessonIds(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return courseMap.tracks.flatMap((track) =>
    track.modules.flatMap((module) =>
      module.lessons
        .filter((lesson) =>
          [
            track.title,
            track.summary,
            module.title,
            module.summary,
            lesson.title,
            lesson.summary,
            lesson.tags?.join(' '),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
        .map((lesson) => lesson.id),
    ),
  )
}

function listExercises(filters?: { track_id?: string; difficulty?: string }) {
  let list = exercises.exercises
  if (filters?.track_id) list = list.filter((item) => item.track_id === filters.track_id)
  if (filters?.difficulty) list = list.filter((item) => item.difficulty === filters.difficulty)
  return list
}

const markdownAnswer = `## Markdown 渲染验证

这是 **粗体**、*斜体*、inline code: \`const ok = true\`。

- 无序列表 A
- 无序列表 B

1. 有序列表第一项
2. 有序列表第二项

> 引用块：AI 输出应该清晰可读，并且不会执行 HTML。

| 能力 | 状态 |
| --- | --- |
| 表格 | 已渲染 |
| 链接 | 已过滤 |

\`\`\`ts
function hello(name: string) {
  return \`Hello, \${name}\`
}
\`\`\`

[安全链接](https://example.com) <script>alert('xss')</script>`

function emit(channel: string, payload: unknown) {
  listeners.get(channel)?.forEach((listener) => listener(payload))
}

function overview() {
  return {
    greetingName: 'SuLi',
    completedLessons: 3,
    totalLessons: 12,
    solvedProblems: 8,
    totalProblems: 36,
    streak: 5,
    level: 6,
    xp: 1320,
    xpInLevel: 320,
    xpForNextLevel: 1000,
    suggestedLesson: {
      trackId: 'algo',
      moduleId: 'arrays',
      lessonId: 'two-pointer',
      title: '双指针入门',
      moduleTitle: '数组与字符串',
    },
  }
}

async function invoke(channel: string, ...args: unknown[]) {
  switch (channel) {
    case 'db-get-setting':
      return null
    case 'db-set-setting':
      return undefined
    case 'pets-list':
      return []
    case 'pets-install-slug':
      return { ok: false, error: '浏览器预览模式不支持在线安装桌宠' }
    case 'pets-import-file':
    case 'pets-import-directory':
      return { ok: false, error: '浏览器预览模式不支持导入本地桌宠' }
    case 'db-get-ai-configs':
      return []
    case 'db-get-default-ai-config':
      return null
    case 'platform-info':
      return { platform: 'browser', arch: 'x64', version: 'dev' }
    case 'home-get-overview':
      return overview()
    case 'analytics-get-summary':
      return { totalEvents: 4, byType: { ai_chat_sent: 1 }, dailyCounts: [] }
    case 'analytics-get-streak':
      return 5
    case 'analytics-get-events':
      return []
    case 'review-due':
    case 'chat-presets-list':
    case 'knowledge-list':
    case 'knowledge-search':
    case 'knowledge-semantic-search':
    case 'mistakes-list':
    case 'problems-list':
      return []
    case 'lessons-list':
      return courseMap.tracks
    case 'lessons-get': {
      const found = findLesson(String(args[0] ?? ''))
      if (!found) throw new Error('Lesson not found')
      return {
        ...found.lesson,
        trackId: found.track.id,
        moduleId: found.module.id,
        content:
          lessonMarkdownByPath[found.lesson.path] ??
          `# ${found.lesson.title}\n\n${found.lesson.summary}`,
      }
    }
    case 'lessons-progress':
    case 'lesson-get-progress':
      return lessonProgress(String(args[0] ?? ''))
    case 'lessons-mark-opened':
    case 'lessons-mark-completed':
      return { ok: true }
    case 'lessons-notes-get':
      return ''
    case 'lessons-notes-save':
      return { ok: true }
    case 'lessons-search':
      return searchLessonIds(String(args[0] ?? ''))
    case 'exercises-list':
      return listExercises(args[0] as { track_id?: string; difficulty?: string } | undefined)
    case 'exercises-get': {
      const exercise = exercises.exercises.find((item) => item.id === String(args[0] ?? ''))
      if (!exercise) throw new Error('Exercise not found')
      return exercise
    }
    case 'exercises-draft-get':
      return null
    case 'exercises-draft-save':
    case 'exercises-draft-clear':
      return { ok: true }
    case 'exercises-evaluate':
      return {
        passed: false,
        score: 0,
        feedback_lines: ['浏览器预览模式未执行真实代码，请在 Electron 应用中提交评测。'],
        stdout: '',
        duration_sec: 0,
      }
    case 'chat-sessions-list':
      return sessions.map(cloneSession)
    case 'chat-session-create': {
      const input = args[0] as { id: string; title: string }
      sessions.unshift({
        id: input.id,
        title: input.title || '新对话',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      messages[input.id] = []
      return cloneSession(sessions[0])
    }
    case 'chat-session-delete': {
      const id = String(args[0])
      const index = sessions.findIndex((session) => session.id === id)
      if (index >= 0) sessions.splice(index, 1)
      delete messages[id]
      return undefined
    }
    case 'chat-messages-load':
      return messages[String(args[0])] ?? []
    case 'chat-message-save': {
      const payload = args[0] as { session_id: string; role: 'user' | 'assistant'; content: string }
      messages[payload.session_id] ??= []
      messages[payload.session_id].push({
        id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: payload.role,
        content: payload.content,
        created_at: new Date().toISOString(),
      })
      return undefined
    }
    case 'chat-memory-capture':
      return undefined
    case 'ai-chat': {
      const payload = args[0] as { requestId: string }
      const requestId = payload.requestId
      const chunks = [
        markdownAnswer.slice(0, 120),
        markdownAnswer.slice(120, 320),
        markdownAnswer.slice(320),
      ]
      chunks.forEach((chunk, index) => {
        window.setTimeout(() => emit('ai-chat-chunk', { requestId, chunk }), 80 + index * 80)
      })
      window.setTimeout(() => emit('ai-chat-done', { requestId, content: markdownAnswer }), 420)
      return undefined
    }
    case 'export-data':
    case 'import-data':
      return undefined
    default:
      return undefined
  }
}

export function installDevBrowserApiMock() {
  if (window.api) return
  const isDevBuild = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  const isDevHost =
    isDevBuild && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  if (!isDevHost) {
    console.error('[devBrowserApiMock] window.api is missing outside a dev browser host')
    return
  }
  window.api = {
    invoke,
    on(channel: string, callback: Listener) {
      const set = listeners.get(channel) ?? new Set<Listener>()
      set.add(callback)
      listeners.set(channel, set)
      return () => set.delete(callback)
    },
  }
}
