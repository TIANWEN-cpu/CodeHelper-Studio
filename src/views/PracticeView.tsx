import React, { useState } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  PanelLeftClose,
  PanelLeft,
  Layers3,
  Target,
  Sparkles,
  Database,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkspaceView } from './WorkspaceView' // Reusing partially
import { motion, AnimatePresence } from 'motion/react'
import { usePracticeData } from '@/hooks/usePracticeData'
import { consumePendingDeepLink, subscribeDeepLink } from '@/lib/deepLink'
import { recordRecent } from '@/lib/recentItems'
import {
  clearPracticeSession,
  readPracticeSession,
  writePracticeSession,
} from '@/utils/practiceSession'
import { toast } from '@/stores/toastStore'
import { exerciseTabId, useEditorStore } from '@/stores/editorStore'
import { getEditorTabCloseWarning } from '@/utils/editorTabClose'
import {
  closeEditorWorkspaceTabLocally,
  getEditorTabPersistenceState,
  requestCloseEditorWorkspaceTab,
  resolveEditorWorkspaceConflict,
} from '@/services/editorWorkspaceSync'
import { onEditorWorkspaceChanged } from '@/services/editorWorkspaceService'
import { isPracticeTab, practiceTabKind } from '@/utils/practiceTabs'
import { getPracticeDraftCloseWarning } from '@/services/practiceDraftSession'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  type BadgeVariant,
} from '@/components/ui'

// ---- Difficulty helpers ----

const difficultyVariant: Record<string, BadgeVariant> = {
  简单: 'success',
  中等: 'warning',
  困难: 'danger',
  基础: 'success',
  进阶: 'warning',
  综合: 'purple',
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
}

function getDifficultyVariant(d: string): BadgeVariant {
  return difficultyVariant[d] ?? 'accent'
}

const PAGE_SIZE = 80

interface PracticeTabNotice {
  tone: 'info' | 'error'
  message: string
}

interface PracticeConfirmOptions {
  title: string
  description: string
  confirmText?: string
  danger?: boolean
}

interface PracticeConfirmState extends PracticeConfirmOptions {
  resolve: (confirmed: boolean) => void
}

const EXERCISE_EXTENSION: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  sql: 'sql',
}

function exerciseFilename(title: string | undefined, id: string, language: string): string {
  const base = (title || id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${base || `exercise_${id}`}.${EXERCISE_EXTENSION[language] ?? 'txt'}`
}

function getDifficultyLabel(d: string): string {
  const lower = d.toLowerCase()
  if (lower === 'easy' || lower === '简单') return '简单'
  if (lower === 'medium' || lower === '中等') return '中等'
  if (lower === 'hard' || lower === '困难') return '困难'
  if (lower === '基础') return '基础'
  if (lower === '进阶') return '进阶'
  if (lower === '综合') return '综合'
  return d
}

// ---- Difficulty filter button ----

const DIFF_ACTIVE_STYLES: Record<BadgeVariant, string> = {
  neutral:
    'border-[var(--color-border-default)] bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]',
  accent:
    'border-[var(--color-accent-primary)]/50 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]',
  purple:
    'border-[var(--color-accent-purple)]/50 bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)]',
  success:
    'border-[var(--color-accent-success)]/50 bg-[var(--color-accent-success)]/10 text-[var(--color-accent-success)]',
  danger:
    'border-[var(--color-accent-danger)]/50 bg-[var(--color-accent-danger)]/10 text-[var(--color-accent-danger)]',
  warning:
    'border-[var(--color-accent-warning)]/50 bg-[var(--color-accent-warning)]/10 text-[var(--color-accent-warning)]',
}

function DiffBtn({
  label,
  active,
  variant,
  onClick,
}: {
  label: string
  active: boolean
  variant: BadgeVariant
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium transition-all',
        active
          ? DIFF_ACTIVE_STYLES[variant]
          : 'border-[var(--color-border-subtle)] bg-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]',
      )}
    >
      {label}
    </button>
  )
}

// ---- Main component ----

export function PracticeView() {
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<string | undefined>(undefined)
  const [trackFilter, setTrackFilter] = useState<string | undefined>(undefined)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'exercise' | 'problem'>('all')
  const [detailTab, setDetailTab] = useState<'desc' | 'hints'>('desc')
  const [page, setPage] = useState(1)
  const [tabCloseNotice, setTabCloseNotice] = useState<PracticeTabNotice | null>(null)
  const [remotePracticeCloseEpoch, setRemotePracticeCloseEpoch] = useState(0)
  const [confirmState, setConfirmState] = useState<PracticeConfirmState | null>(null)
  const initialTargetHandledRef = React.useRef(false)
  const selectingExerciseIdsRef = React.useRef(new Set<string>())
  const locallyClosingTabIdsRef = React.useRef(new Set<string>())
  const knownOpenPracticeTabIdsRef = React.useRef(new Set<string>())
  const remotePracticeCloseHandlingRef = React.useRef(new Set<string>())
  const remotelyClosedPracticeTabIdsRef = React.useRef(new Set<string>())

  const editorHydrated = useEditorStore((state) => state.hydrated)
  const editorTabs = useEditorStore((state) => state.tabs)
  const activeEditorTabId = useEditorStore((state) => state.activeTabId)

  const {
    exercises,
    loading,
    error,
    currentExercise,
    loadingExercise,
    selectExercise,
    code,
    setCode,
    language,
    setLanguage,
    submitResult,
    submitting,
    submitCode,
    draftSaving,
    draftDirty,
    draftError,
    draftDegradedMessage,
    draftRestoreMessage,
    draftConflict,
    flushDraft,
    getRecoveryOnlyDraftCloseState,
    deactivateExercise,
    keepLocalDraft,
    reloadPersistedDraft,
  } = usePracticeData()

  const requestConfirm = React.useCallback(
    (options: PracticeConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...options, resolve })
      }),
    [],
  )

  const settleConfirm = React.useCallback(
    (confirmed: boolean) => {
      confirmState?.resolve(confirmed)
      setConfirmState(null)
    },
    [confirmState],
  )

  const handleSelectExercise = React.useCallback(
    async (id: string) => {
      selectingExerciseIdsRef.current.add(id)
      try {
        const resumesInMemoryDraft = currentExercise?.id === id
        const selected = await selectExercise(id)
        if (!selected && !resumesInMemoryDraft) return false

        const exercise = exercises.find((item) => item.id === id)
        const preferredLanguage = exercise?.languages?.[0] || 'python'
        const tabKind = practiceTabKind(exercise?.source_type)
        const tabId = exerciseTabId(id)
        const state = useEditorStore.getState()
        const openTab = state.tabs.find((tab) => tab.id === tabId)
        const closedTab = state.recentlyClosedTabs.find((tab) => tab.id === tabId)
        if (openTab) {
          state.setActiveTab(tabId)
        } else if (closedTab) {
          state.reopenTab(tabId)
        } else {
          state.addTab({
            id: tabId,
            kind: tabKind,
            problemId: id,
            filename: exerciseFilename(exercise?.title, id, preferredLanguage),
            language: preferredLanguage,
            content: '',
          })
        }

        if (useEditorStore.getState().tabs.some((tab) => tab.id === tabId)) {
          knownOpenPracticeTabIdsRef.current.add(tabId)
        }
        recordRecent({ kind: 'exercise', id })
        const sessionResult = writePracticeSession(id)
        if (sessionResult.persisted) {
          setTabCloseNotice(null)
        } else {
          const message = `练习已打开，但${sessionResult.error ?? '本地练习恢复状态写入失败'}；重启恢复将以标签工作区为准`
          setTabCloseNotice({ tone: 'error', message })
          setPanelCollapsed(false)
          toast.error(message, 0)
        }
        setDetailTab('desc')
        setViewMode('detail')
        return true
      } finally {
        selectingExerciseIdsRef.current.delete(id)
      }
    },
    [currentExercise?.id, exercises, selectExercise],
  )

  const preservePracticeTabLocally = React.useCallback(
    (snapshot: {
      id: string
      title: string
      sourceType: 'exercise' | 'problem' | undefined
      language: string
    }) => {
      const tabId = exerciseTabId(snapshot.id)
      useEditorStore.setState((state) => {
        const existing =
          state.tabs.find((tab) => tab.id === tabId) ??
          state.recentlyClosedTabs.find((tab) => tab.id === tabId)
        const localTab = {
          ...(existing ?? {}),
          id: tabId,
          kind: practiceTabKind(snapshot.sourceType),
          problemId: snapshot.id,
          filename: exerciseFilename(snapshot.title, snapshot.id, snapshot.language),
          language: snapshot.language,
          content: '',
          localOnly: true as const,
          updatedAt: new Date().toISOString(),
        }
        return {
          tabs: [...state.tabs.filter((tab) => tab.id !== tabId), localTab],
          activeTabId: tabId,
          recentlyClosedTabs: state.recentlyClosedTabs.filter((tab) => tab.id !== tabId),
          dirty: true,
        }
      })
      useEditorStore.getState().setActiveTab(tabId)
      knownOpenPracticeTabIdsRef.current.add(tabId)
    },
    [],
  )

  React.useEffect(
    () =>
      onEditorWorkspaceChanged((event) => {
        if (
          event.kind !== 'closed' ||
          !isPracticeTab(event.tab) ||
          locallyClosingTabIdsRef.current.has(event.tab.id)
        ) {
          return
        }
        remotelyClosedPracticeTabIdsRef.current.add(event.tab.id)
        setRemotePracticeCloseEpoch((epoch) => epoch + 1)
      }),
    [],
  )

  const handleCloseExerciseTab = React.useCallback(
    async (tabId: string) => {
      const beforeClose = useEditorStore.getState()
      const tab = beforeClose.tabs.find((item) => item.id === tabId)
      if (!tab || !isPracticeTab(tab)) return
      const exerciseTabs = beforeClose.tabs.filter((item) => isPracticeTab(item))
      const closedIndex = exerciseTabs.findIndex((item) => item.id === tabId)
      const wasActive = beforeClose.activeTabId === tabId

      locallyClosingTabIdsRef.current.add(tabId)
      try {
        let draftCloseWarning: string | null = null
        let draftCloseConflict = false
        if (wasActive) {
          const result = await flushDraft()
          if (result.durability === 'none') {
            toast.error(result.error ?? '草稿未能写入数据库或恢复区，标签保持打开')
            return
          }
          draftCloseConflict = draftConflict || Boolean(result.conflict)
          draftCloseWarning = getPracticeDraftCloseWarning({
            durability: result.durability,
            conflict: draftCloseConflict,
            error: result.error,
          })
          if (
            draftCloseWarning &&
            !(await requestConfirm({
              title: '关闭练习标签',
              description: draftCloseWarning,
              confirmText: '关闭标签',
              danger: true,
            }))
          )
            return
          if (draftCloseConflict) {
            toast.info('草稿版本冲突仍未处理，最新本地内容仅保存在恢复区')
          } else if (result.durability === 'recovery') {
            toast.info('SQLite 草稿保存不可用，最新内容仅保存在本地恢复区')
          }
        } else if (tab.problemId) {
          const recoveryOnlyState = getRecoveryOnlyDraftCloseState(tab.problemId)
          draftCloseWarning = recoveryOnlyState
            ? getPracticeDraftCloseWarning(recoveryOnlyState)
            : null
          if (
            draftCloseWarning &&
            !(await requestConfirm({
              title: '关闭练习标签',
              description: draftCloseWarning,
              confirmText: '关闭标签',
              danger: true,
            }))
          )
            return
        }

        const persistence = getEditorTabPersistenceState(tabId)
        const editorState = useEditorStore.getState()
        const warning = getEditorTabCloseWarning({
          pending: persistence.pending,
          conflict: persistence.conflict,
          degraded: persistence.degraded || editorState.databaseStatus === 'degraded',
          persistenceError: editorState.persistenceError,
          error: persistence.error ?? editorState.databaseError,
        })
        if (
          warning &&
          !(await requestConfirm({
            title: '关闭练习标签',
            description: warning,
            confirmText: '关闭标签',
            danger: true,
          }))
        )
          return

        if (exerciseTabs.length === 1) {
          const sessionResult = clearPracticeSession()
          if (!sessionResult.persisted) {
            const message = `${sessionResult.error ?? '本地练习恢复状态写入失败'}，标签保持打开`
            setTabCloseNotice({ tone: 'error', message })
            setPanelCollapsed(false)
            toast.error(message, 0)
            return
          }
        }

        let closed = await requestCloseEditorWorkspaceTab(tabId)
        if (!closed) {
          const closeLocally = await requestConfirm({
            title: '仅在本地关闭标签',
            description:
              'SQLite 标签同步仍未成功。确定后将仅在本地关闭标签，练习代码仍由草稿恢复区保护。',
            confirmText: '仅本地关闭',
            danger: true,
          })
          if (!closeLocally) return
          await closeEditorWorkspaceTabLocally(tabId)
          closed = true
          toast.info('练习标签已仅在本地关闭，可从最近关闭中恢复')
        }
        if (!closed) return

        const remaining = useEditorStore.getState().tabs.filter((item) => isPracticeTab(item))
        if (!wasActive && remaining.length > 0) return
        const next =
          remaining[Math.min(Math.max(closedIndex, 0), Math.max(remaining.length - 1, 0))]
        if (next?.problemId) {
          const switched = await handleSelectExercise(next.problemId)
          if (!switched) {
            useEditorStore.getState().reopenTab(tabId)
            toast.error('无法安全切换到下一个练习，已重新打开原标签')
          }
          return
        }

        const deactivated = await deactivateExercise(tab.problemId)
        if (deactivated.outcome === 'exercise-changed') return
        if (deactivated.durability === 'none') {
          useEditorStore.getState().reopenTab(tabId)
          const message = deactivated.error ?? '无法安全关闭最后一个练习标签'
          setTabCloseNotice({ tone: 'error', message })
          setPanelCollapsed(false)
          toast.error(message, 0)
          return
        }
        knownOpenPracticeTabIdsRef.current.delete(tabId)
        setViewMode('list')
      } finally {
        locallyClosingTabIdsRef.current.delete(tabId)
      }
    },
    [
      deactivateExercise,
      draftConflict,
      flushDraft,
      getRecoveryOnlyDraftCloseState,
      handleSelectExercise,
      requestConfirm,
    ],
  )

  React.useEffect(() => {
    if (!editorHydrated || !currentExercise) return
    const tabId = exerciseTabId(currentExercise.id)
    const open = editorTabs.some((tab) => tab.id === tabId && isPracticeTab(tab))
    const remoteCloseSignaled = remotelyClosedPracticeTabIdsRef.current.has(tabId)
    if (open && !remoteCloseSignaled) {
      knownOpenPracticeTabIdsRef.current.add(tabId)
      return
    }
    if (
      (!remoteCloseSignaled && !knownOpenPracticeTabIdsRef.current.has(tabId)) ||
      selectingExerciseIdsRef.current.has(currentExercise.id) ||
      locallyClosingTabIdsRef.current.has(tabId) ||
      remotePracticeCloseHandlingRef.current.has(tabId)
    ) {
      return
    }

    const snapshot = {
      id: currentExercise.id,
      title: currentExercise.title,
      sourceType: currentExercise.source_type,
      language,
    }
    remotePracticeCloseHandlingRef.current.add(tabId)
    void (async () => {
      const remainingPracticeTab = editorTabs.find(
        (tab) => tab.id !== tabId && isPracticeTab(tab) && tab.problemId,
      )
      const sessionResult = remainingPracticeTab?.problemId
        ? writePracticeSession(remainingPracticeTab.problemId)
        : clearPracticeSession()
      if (!sessionResult.persisted) {
        preservePracticeTabLocally(snapshot)
        const message = `另一个窗口关闭了“${snapshot.title}”标签，但${sessionResult.error ?? '本地练习恢复状态写入失败'}。已在本窗口保留本地标签和内存内容，请勿关闭窗口。`
        setTabCloseNotice({ tone: 'error', message })
        setPanelCollapsed(false)
        toast.error(message, 0)
        return
      }

      const result = await deactivateExercise(snapshot.id)
      if (result.outcome === 'exercise-changed') return
      if (result.outcome === 'persistence-failed') {
        preservePracticeTabLocally(snapshot)
        const message = `另一个窗口关闭了“${snapshot.title}”标签，但草稿无法写入数据库或恢复区。已在本窗口保留本地标签和内存内容，请勿关闭窗口。${result.error ? ` ${result.error}` : ''}`
        setTabCloseNotice({ tone: 'error', message })
        setPanelCollapsed(false)
        toast.error(message, 0)
        return
      }

      await resolveEditorWorkspaceConflict('use-database', tabId)
      knownOpenPracticeTabIdsRef.current.delete(tabId)
      const message =
        result.durability === 'recovery'
          ? `另一个窗口已关闭“${snapshot.title}”标签；最新草稿仅保存在本地恢复区，已返回题库。`
          : `另一个窗口已关闭“${snapshot.title}”标签；草稿已保存，已返回题库。`
      setTabCloseNotice({ tone: 'info', message })
      setViewMode('list')
      setPanelCollapsed(false)
      toast.info(message)
    })().finally(() => {
      remotelyClosedPracticeTabIdsRef.current.delete(tabId)
      remotePracticeCloseHandlingRef.current.delete(tabId)
    })
  }, [
    currentExercise,
    deactivateExercise,
    editorHydrated,
    editorTabs,
    language,
    preservePracticeTabLocally,
    remotePracticeCloseEpoch,
  ])

  React.useEffect(() => {
    if (!currentExercise) return
    const tabId = exerciseTabId(currentExercise.id)
    const tab = useEditorStore.getState().tabs.find((item) => item.id === tabId)
    if (!tab) return
    const tabKind = practiceTabKind(currentExercise.source_type)
    const filename = exerciseFilename(currentExercise.title, currentExercise.id, language)
    if (
      tab.filename === filename &&
      tab.language === language &&
      tab.problemId === currentExercise.id &&
      tab.kind === tabKind &&
      tab.content === ''
    )
      return
    useEditorStore.getState().updateTab(tabId, {
      filename,
      language,
      problemId: currentExercise.id,
      kind: tabKind,
      content: '',
    })
  }, [code, currentExercise, language])

  // Restored active exercise topology is authoritative. The old session key is only a fallback.
  React.useEffect(() => {
    if (!editorHydrated || initialTargetHandledRef.current) return
    initialTargetHandledRef.current = true
    const pending = consumePendingDeepLink('exercise')
    const activeExercise = editorTabs.find(
      (tab) => tab.id === activeEditorTabId && isPracticeTab(tab) && tab.problemId,
    )
    const target = pending ?? activeExercise?.problemId ?? readPracticeSession()?.exerciseId
    if (target) void handleSelectExercise(target)
  }, [activeEditorTabId, editorHydrated, editorTabs, handleSelectExercise])

  React.useEffect(
    () => subscribeDeepLink('exercise', (id) => void handleSelectExercise(id)),
    [handleSelectExercise],
  )

  // Filter exercises by search and difficulty
  const trackOptions = Array.from(
    new Set(exercises.map((ex) => ex.track_id).filter(Boolean)),
  ).sort()
  const difficultyOptions = Array.from(
    new Set(exercises.map((ex) => ex.difficulty).filter(Boolean)),
  ).sort((a, b) => {
    const order = ['基础', '简单', 'easy', '进阶', '中等', 'medium', '综合', '困难', 'hard']
    return order.indexOf(a) - order.indexOf(b)
  })
  const aiTutorExerciseCount = exercises.filter((ex) => ex.track_id === 'ai-tutor').length
  const builtinExerciseCount = exercises.filter((ex) => ex.source_type !== 'problem').length
  const importedProblemCount = exercises.filter((ex) => ex.source_type === 'problem').length
  const filteredExercises = exercises.filter((ex) => {
    const query = searchQuery.toLowerCase()
    const matchesSearch =
      ex.title.toLowerCase().includes(query) ||
      ex.prompt?.toLowerCase().includes(query) ||
      ex.track_id.toLowerCase().includes(query) ||
      ex.source?.toLowerCase().includes(query) ||
      ex.platform?.toLowerCase().includes(query)
    const matchesDifficulty =
      !difficultyFilter || ex.difficulty.toLowerCase() === difficultyFilter.toLowerCase()
    const matchesTrack = !trackFilter || ex.track_id === trackFilter
    const matchesSource = sourceFilter === 'all' || ex.source_type === sourceFilter
    return matchesSearch && matchesDifficulty && matchesTrack && matchesSource
  })
  const totalPages = Math.max(1, Math.ceil(filteredExercises.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visibleExercises = filteredExercises.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  React.useEffect(() => {
    setPage(1)
  }, [searchQuery, difficultyFilter, trackFilter, sourceFilter])

  return (
    <div className="flex h-full bg-[var(--color-bg-base)] w-full relative">
      {/* Practice Description Panel */}
      <AnimatePresence initial={false}>
        {!panelCollapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 500, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="shrink-0 overflow-hidden z-10 bg-[var(--color-bg-base)] border-r border-[var(--color-border-subtle)]"
          >
            <div className="flex flex-col h-full w-[500px] overflow-y-auto custom-scrollbar">
              {tabCloseNotice && (
                <div
                  role={tabCloseNotice.tone === 'error' ? 'alert' : 'status'}
                  className={cn(
                    'shrink-0 border-b px-4 py-2 text-xs leading-relaxed',
                    tabCloseNotice.tone === 'error'
                      ? 'border-[var(--color-accent-danger)]/40 bg-[var(--color-accent-danger)]/10 text-[var(--color-accent-danger)]'
                      : 'border-[var(--color-accent-primary)]/35 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]',
                  )}
                >
                  {tabCloseNotice.message}
                </div>
              )}
              {viewMode === 'list' ? (
                /* ---------- Exercise List View ---------- */
                <div className="flex flex-col h-full">
                  {/* Search & Filter Header */}
                  <div className="p-4 border-b border-[var(--color-border-subtle)] space-y-3 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg-card)_92%,transparent),var(--color-bg-base))]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] tracking-wide">
                        练习题库
                      </h3>
                      {loading && <Spinner size="sm" />}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Card padding="sm">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                          <Target size={11} />
                          总题数
                        </div>
                        <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                          {exercises.length}
                        </div>
                      </Card>
                      <Card padding="sm">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                          <FileCode2 size={11} />
                          当前
                        </div>
                        <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                          {filteredExercises.length}
                        </div>
                      </Card>
                      <Card padding="sm">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                          <Layers3 size={11} />
                          路线
                        </div>
                        <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                          {trackOptions.length}
                        </div>
                      </Card>
                    </div>
                    <div className="relative">
                      <Search
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                      />
                      <Input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索题目..."
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DiffBtn
                        label="全部"
                        active={!difficultyFilter}
                        variant="accent"
                        onClick={() => setDifficultyFilter(undefined)}
                      />
                      {difficultyOptions.slice(0, 6).map((difficulty) => (
                        <DiffBtn
                          key={difficulty}
                          label={getDifficultyLabel(difficulty)}
                          active={difficultyFilter === difficulty}
                          variant={getDifficultyVariant(difficulty)}
                          onClick={() => setDifficultyFilter(difficulty)}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSourceFilter(sourceFilter === 'problem' ? 'all' : 'problem')
                        }
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all',
                          sourceFilter === 'problem'
                            ? 'border-[var(--color-accent-success)]/50 bg-[var(--color-accent-success)]/10 text-[var(--color-accent-success)]'
                            : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                        )}
                        aria-pressed={sourceFilter === 'problem'}
                        title="只看导入题库"
                      >
                        <Database size={13} />
                        导入题库
                        <Badge variant="neutral" className="rounded-full px-1.5 py-0.5 text-[10px]">
                          {importedProblemCount}
                        </Badge>
                      </button>
                      {trackOptions.includes('ai-tutor') && (
                        <button
                          type="button"
                          data-ai-tutor-practice-filter
                          onClick={() =>
                            setTrackFilter(trackFilter === 'ai-tutor' ? undefined : 'ai-tutor')
                          }
                          className={cn(
                            'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all',
                            trackFilter === 'ai-tutor'
                              ? 'border-[var(--color-accent-secondary-solid)] bg-gradient-to-r from-[var(--color-accent-solid)] to-[var(--color-accent-secondary-solid)] text-[var(--color-on-accent)] shadow-lg shadow-[var(--color-accent-purple)]/20'
                              : 'border-[var(--color-accent-purple)]/40 bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] hover:bg-[var(--color-accent-purple)]/16',
                          )}
                          aria-pressed={trackFilter === 'ai-tutor'}
                          title="AI Tutor exercises"
                        >
                          <Sparkles size={13} />
                          AI Tutor
                          <span className="rounded-full bg-[var(--color-on-accent)]/20 px-1.5 py-0.5 text-[10px]">
                            {aiTutorExerciseCount}
                          </span>
                        </button>
                      )}
                      <Select
                        value={trackFilter ?? ''}
                        onChange={(event) => setTrackFilter(event.target.value || undefined)}
                        aria-label="路线筛选"
                      >
                        <option value="">全部路线</option>
                        {trackOptions.map((track) => (
                          <option key={track} value={track}>
                            {track}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                      <span>
                        内置练习 {builtinExerciseCount} · 导入题库 {importedProblemCount}
                      </span>
                      <div className="flex items-center gap-2">
                        <IconButton
                          label="上一页"
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={safePage <= 1}
                        >
                          <ChevronLeft />
                        </IconButton>
                        <span className="font-mono">
                          {safePage}/{totalPages}
                        </span>
                        <IconButton
                          label="下一页"
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={safePage >= totalPages}
                        >
                          <ChevronRight />
                        </IconButton>
                      </div>
                    </div>
                  </div>

                  {/* Exercise List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {error && (
                      <div className="mx-2 rounded-lg border border-[var(--color-accent-danger)]/30 bg-[var(--color-accent-danger)]/10 p-3 text-xs text-[var(--color-accent-danger)]">
                        {error}
                      </div>
                    )}
                    {loading && visibleExercises.length === 0 && !error && (
                      <div className="space-y-2 p-1" aria-hidden>
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="h-16" />
                        ))}
                      </div>
                    )}
                    {!loading && filteredExercises.length === 0 && (
                      <EmptyState icon={FileCode2} title="暂无匹配题目" />
                    )}
                    <AnimatePresence initial={false}>
                      {visibleExercises.map((ex, index) => (
                        <motion.button
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.015 }}
                          key={ex.id}
                          onClick={() => handleSelectExercise(ex.id)}
                          className="group w-full text-left p-3 rounded-lg border border-transparent hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[var(--color-text-primary)] font-medium truncate group-hover:text-[var(--color-accent-primary)] transition-colors">
                                {ex.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                <Badge
                                  variant={getDifficultyVariant(ex.difficulty)}
                                  className="px-1.5 text-[10px]"
                                >
                                  {getDifficultyLabel(ex.difficulty)}
                                </Badge>
                                {ex.track_id && (
                                  <Badge variant="neutral" className="px-1.5 text-[10px]">
                                    {ex.track_id}
                                  </Badge>
                                )}
                                <Badge
                                  variant={ex.source_type === 'problem' ? 'success' : 'purple'}
                                  className="px-1.5 text-[10px]"
                                >
                                  {ex.source_type === 'problem' ? '导入题库' : '内置练习'}
                                </Badge>
                                {ex.source && (
                                  <Badge variant="neutral" className="px-1.5 text-[10px]">
                                    {ex.source}
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                                {ex.prompt}
                              </p>
                            </div>
                            <ChevronRight
                              size={14}
                              className="shrink-0 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                /* ---------- Exercise Detail View ---------- */
                <div className="flex flex-col h-full">
                  {/* Detail header with back button */}
                  <motion.div
                    key={currentExercise?.id ?? 'empty-exercise'}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className="p-6 relative"
                  >
                    <IconButton
                      label="收起描述面板"
                      onClick={() => setPanelCollapsed(true)}
                      className="absolute right-4 top-4"
                    >
                      <PanelLeftClose />
                    </IconButton>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="-ml-2 mb-3"
                    >
                      <ChevronLeft size={14} />
                      返回题库
                    </Button>

                    {loadingExercise ? (
                      <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-sm py-8">
                        <Spinner size="sm" />
                        加载中...
                      </div>
                    ) : currentExercise ? (
                      <>
                        <div className="flex flex-col gap-1 mb-4 pr-8">
                          <h2 className="text-xl font-bold text-[var(--color-text-primary)] tracking-wide">
                            {currentExercise.title}
                          </h2>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge
                              variant={getDifficultyVariant(currentExercise.difficulty)}
                              className="px-2 py-1"
                            >
                              {getDifficultyLabel(currentExercise.difficulty)}
                            </Badge>
                            <Badge
                              variant={
                                currentExercise.source_type === 'problem' ? 'success' : 'purple'
                              }
                              className="px-2 py-1"
                            >
                              {currentExercise.source_type === 'problem' ? '导入题库' : '内置练习'}
                            </Badge>
                            {currentExercise.source && (
                              <Badge variant="neutral" className="px-2 py-1">
                                {currentExercise.source}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Tab bar */}
                        <Tabs
                          items={[
                            { value: 'desc', label: '题目描述' },
                            ...(currentExercise.hints && currentExercise.hints.length > 0
                              ? [
                                  {
                                    value: 'hints',
                                    label: `提示 (${currentExercise.hints.length})`,
                                  },
                                ]
                              : []),
                          ]}
                          value={detailTab}
                          onChange={(value) => setDetailTab(value as 'desc' | 'hints')}
                          ariaLabel="题目详情"
                          className="mb-6"
                        />

                        {/* Tab content: real description / hints switch */}
                        {detailTab === 'desc' || !currentExercise.hints?.length ? (
                          <div className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed">
                            {currentExercise.prompt}
                          </div>
                        ) : (
                          <ul className="text-sm space-y-2 text-[var(--color-text-secondary)] marker:text-[var(--color-border-subtle)] pl-4 list-disc leading-relaxed">
                            {currentExercise.hints.map((hint, i) => (
                              <li key={i}>{hint}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <EmptyState icon={FileCode2} title="请从题库中选择一道题目" />
                    )}
                  </motion.div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed panel icon */}
      {panelCollapsed && (
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-[var(--color-bg-panel)] border-r border-[var(--color-border-subtle)] flex flex-col items-center py-4 z-20">
          <IconButton label="展开题目描述" onClick={() => setPanelCollapsed(false)}>
            <PanelLeft />
          </IconButton>
        </div>
      )}

      {/* Editor Area (reuses WorkspaceView) */}
      <div
        className={cn(
          'flex-1 overflow-hidden flex flex-col min-w-0 transition-all duration-300',
          panelCollapsed ? 'ml-12' : '',
        )}
      >
        <WorkspaceView
          hideExplorer={true}
          exerciseContext={
            currentExercise
              ? {
                  id: currentExercise.id,
                  tabId: exerciseTabId(currentExercise.id),
                  title: currentExercise.title,
                  code,
                  setCode,
                  language,
                  setLanguage,
                  submitResult,
                  isSubmitting: submitting,
                  submitCode,
                  draftSaving,
                  draftDirty,
                  draftError,
                  draftDegradedMessage,
                  draftRestoreMessage,
                  draftConflict,
                  keepLocalDraft,
                  reloadPersistedDraft,
                  selectTab: handleSelectExercise,
                  closeTab: handleCloseExerciseTab,
                }
              : null
          }
        />
      </div>

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmText={confirmState?.confirmText}
        danger={confirmState?.danger ?? false}
        onConfirm={() => settleConfirm(true)}
        onCancel={() => settleConfirm(false)}
      />
    </div>
  )
}
