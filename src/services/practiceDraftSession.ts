import {
  clearDraft,
  getDraft,
  getExercise,
  saveDraft,
  type Exercise,
  type PracticeDraft,
} from './practiceService'
import {
  DraftAutosaveCoordinator,
  DraftConflictError,
  type DraftSnapshot,
} from '@/utils/draftAutosave'
import {
  clearDraftRecovery,
  readDraftRecoveryWithStatus,
  writeDraftRecovery,
  type DraftRecoveryEntry,
  type DraftRecoveryReadResult,
} from '@/utils/draftRecovery'
import { resolvePracticeDraft } from '@/utils/practiceDraftResolution'
import { bindDraftFlushLifecycle } from '@/utils/draftLifecycle'
import { registerAppCloseFlushHandler, type AppCloseFlushResult } from './appCloseLifecycle'
import {
  MAX_EDITOR_TABS,
  exerciseTabId,
  flushPersistTabs,
  useEditorStore,
  type EditorTab,
} from '@/stores/editorStore'
import { stableEditorWorkspaceHash } from '@/shared/editorWorkspaceContract'

export type DraftDurability = 'database' | 'recovery' | 'none'

export interface DraftFlushResult {
  durability: DraftDurability
  error: string | null
  conflict?: boolean
}

export interface PracticeDraftCloseState {
  durability: DraftDurability
  conflict: boolean
  error: string | null
}

export function getPracticeDraftCloseWarning(state: PracticeDraftCloseState): string | null {
  if (state.conflict) {
    return '练习草稿存在未处理的版本冲突；最新本地内容仅保存在恢复区，尚未写入 SQLite。关闭后仍需重新打开该练习，并选择保留本地草稿或重新加载已保存版本。确定关闭吗？'
  }
  if (state.durability !== 'recovery') return null
  return `练习草稿未能写入 SQLite，最新内容仅保存在本地恢复区${state.error ? `：${state.error}` : ''}。关闭后仍可恢复，但当前不是完整数据库保存。确定关闭吗？`
}

export interface DraftDeactivateResult extends DraftFlushResult {
  deactivated: boolean
  outcome: 'deactivated' | 'persistence-failed' | 'exercise-changed'
}

interface DraftConflictState {
  current: PracticeDraft | null
}

export interface PracticeDraftSessionState {
  error: string | null
  currentExercise: Exercise | null
  loadingExercise: boolean
  code: string
  language: string
  draftSaving: boolean
  draftDirty: boolean
  draftError: string | null
  draftDegradedMessage: string | null
  draftRestoreMessage: string | null
  draftConflict: boolean
}

export interface PracticeDraftSessionDependencies {
  getExercise: typeof getExercise
  getDraft: typeof getDraft
  saveDraft: typeof saveDraft
  clearDraft: typeof clearDraft
  readRecovery: (exerciseId: string) => DraftRecoveryReadResult
  writeRecovery: typeof writeDraftRecovery
  clearRecovery: typeof clearDraftRecovery
  registerCloseHandler: typeof registerAppCloseFlushHandler
  bindFlushLifecycle: typeof bindDraftFlushLifecycle
}

export interface PracticeDraftSessionOptions {
  autosaveDelayMs?: number
  registerLifecycle?: boolean
}

const defaultDependencies: PracticeDraftSessionDependencies = {
  getExercise,
  getDraft,
  saveDraft,
  clearDraft,
  readRecovery: readDraftRecoveryWithStatus,
  writeRecovery: writeDraftRecovery,
  clearRecovery: clearDraftRecovery,
  registerCloseHandler: registerAppCloseFlushHandler,
  bindFlushLifecycle: bindDraftFlushLifecycle,
}

const initialState: PracticeDraftSessionState = {
  error: null,
  currentExercise: null,
  loadingExercise: false,
  code: '',
  language: 'python',
  draftSaving: false,
  draftDirty: false,
  draftError: null,
  draftDegradedMessage: null,
  draftRestoreMessage: null,
  draftConflict: false,
}

interface RecoveryOnlyDraftState {
  title: string
  conflict: boolean
  error: string | null
}

export class PracticeDraftSession {
  private state: PracticeDraftSessionState = initialState
  private readonly listeners = new Set<() => void>()
  private readonly coordinator: DraftAutosaveCoordinator
  private activeExerciseId: string | null = null
  private activeExerciseTitle: string | undefined
  private exerciseRequestId = 0
  private draftConflict: DraftConflictState | null = null
  private readonly recoveryOnlyDrafts = new Map<string, RecoveryOnlyDraftState>()
  private activeRecoverySourceKeys: string[] = []
  private unregisterCloseHandler: (() => void) | null = null
  private unbindFlushLifecycle: (() => void) | null = null

  constructor(
    private readonly dependencies: PracticeDraftSessionDependencies = defaultDependencies,
    options: PracticeDraftSessionOptions = {},
  ) {
    this.coordinator = new DraftAutosaveCoordinator(
      async (exerciseId, snapshot, baseRevision) => {
        const result = await this.dependencies.saveDraft(
          exerciseId,
          snapshot.code,
          snapshot.language,
          baseRevision,
          this.activeExerciseTitle,
        )
        if (result.status === 'conflict') {
          this.draftConflict = { current: result.current }
          this.patch({ draftConflict: true })
          throw new DraftConflictError()
        }
        return { revision: result.draft.revision, updatedAt: result.draft.updatedAt }
      },
      {
        delayMs: options.autosaveDelayMs,
        onSavingChange: (draftSaving) => {
          this.patch({
            draftSaving,
            ...(!draftSaving ? { draftDirty: this.coordinator.hasPending() } : {}),
          })
        },
        onError: (error) => {
          this.patch({
            draftError:
              error instanceof DraftConflictError
                ? error.message
                : error instanceof Error
                  ? `自动保存草稿失败：${error.message}`
                  : '自动保存草稿失败，将在下次编辑时重试',
            draftDirty: true,
          })
        },
        onSaved: (event) => {
          let recoveryError: string | null = null
          if (event.pending && event.pendingLocalVersion) {
            recoveryError = this.dependencies.writeRecovery(
              event.exerciseId,
              event.pending,
              event.revision,
              event.pendingLocalVersion,
            )
          } else {
            this.dependencies.clearRecovery(event.exerciseId, { snapshot: event.saved })
          }
          this.draftConflict = null
          if (!event.pending) this.clearRecoveryOnlyDraft(event.exerciseId)
          this.patch({
            draftError: recoveryError,
            draftConflict: false,
            draftDirty: Boolean(event.pending),
          })
        },
      },
    )

    if (options.registerLifecycle !== false) {
      this.unregisterCloseHandler = this.dependencies.registerCloseHandler('practice-draft', () =>
        this.flushForAppClose(),
      )
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        this.unbindFlushLifecycle = this.dependencies.bindFlushLifecycle(async () => {
          await this.flushDraft()
        })
      }
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): PracticeDraftSessionState => this.state

  private patch(patch: Partial<PracticeDraftSessionState>): void {
    const next = { ...this.state, ...patch }
    if (
      (Object.keys(patch) as Array<keyof PracticeDraftSessionState>).every((key) =>
        Object.is(this.state[key], next[key]),
      )
    ) {
      return
    }
    this.state = next
    this.listeners.forEach((listener) => listener())
  }

  readonly flushDraft = async (): Promise<DraftFlushResult> => {
    const coordinatorState = this.coordinator.getState()
    if (!coordinatorState || !this.coordinator.hasPending()) {
      if (coordinatorState && !this.coordinator.hasConflict()) {
        this.clearRecoveryOnlyDraft(coordinatorState.exerciseId)
      }
      return { durability: 'database', error: null }
    }

    const recoveryError = this.dependencies.writeRecovery(
      coordinatorState.exerciseId,
      coordinatorState.snapshot,
      coordinatorState.baseRevision,
      coordinatorState.localVersion,
    )
    try {
      await this.coordinator.flush()
      if (!this.coordinator.hasPending()) {
        this.clearRecoveryOnlyDraft(coordinatorState.exerciseId)
        return { durability: 'database', error: null }
      }
      const result: DraftFlushResult = recoveryError
        ? { durability: 'none', error: recoveryError }
        : { durability: 'recovery', error: null }
      this.updateRecoveryOnlyDraft(coordinatorState.exerciseId, result, false)
      this.patch({ draftError: result.error, draftDirty: true })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : '练习草稿数据库保存失败'
      const conflict = error instanceof DraftConflictError || this.coordinator.hasConflict()
      const result: DraftFlushResult = recoveryError
        ? { durability: 'none', error: `${message}；${recoveryError}` }
        : {
            durability: 'recovery',
            error: message,
            ...(conflict ? { conflict: true } : {}),
          }
      this.updateRecoveryOnlyDraft(coordinatorState.exerciseId, result, conflict)
      this.patch({ draftError: result.error, draftDirty: true })
      return result
    }
  }

  private updateRecoveryOnlyDraft(
    exerciseId: string,
    result: DraftFlushResult,
    conflict: boolean,
  ): void {
    if (result.durability !== 'recovery') {
      this.clearRecoveryOnlyDraft(exerciseId)
      return
    }
    const title =
      exerciseId === this.activeExerciseId
        ? (this.activeExerciseTitle ?? this.state.currentExercise?.title ?? exerciseId)
        : exerciseId
    this.recoveryOnlyDrafts.set(exerciseId, { title, conflict, error: result.error })
    this.refreshDraftDegradedMessage()
  }

  readonly getRecoveryOnlyDraftCloseState = (
    exerciseId: string,
  ): PracticeDraftCloseState | null => {
    const draft = this.recoveryOnlyDrafts.get(exerciseId)
    return draft ? { durability: 'recovery', conflict: draft.conflict, error: draft.error } : null
  }

  private clearRecoveryOnlyDraft(exerciseId: string): void {
    if (!this.recoveryOnlyDrafts.delete(exerciseId)) return
    this.refreshDraftDegradedMessage()
  }

  private refreshDraftDegradedMessage(): void {
    const drafts = [...this.recoveryOnlyDrafts.values()]
    if (drafts.length === 0) {
      this.patch({ draftDegradedMessage: null })
      return
    }
    if (drafts.length === 1) {
      const draft = drafts[0]
      this.patch({
        draftDegradedMessage: draft.conflict
          ? `“${draft.title}”草稿存在未处理的版本冲突；最新本地内容仅保存在恢复区，尚未写入 SQLite。`
          : `“${draft.title}”的最新草稿仅保存在本地恢复区，尚未写入 SQLite。`,
      })
      return
    }
    const conflictCount = drafts.filter((draft) => draft.conflict).length
    this.patch({
      draftDegradedMessage: `有 ${drafts.length} 个练习的最新草稿仅保存在本地恢复区，尚未写入 SQLite${conflictCount > 0 ? `；其中 ${conflictCount} 个存在未处理的版本冲突` : ''}。`,
    })
  }

  readonly flushForAppClose = async (): Promise<AppCloseFlushResult> => {
    const result = await this.flushDraft()
    if (result.durability === 'database') return { ok: true }
    return {
      ok: false,
      recoveryAvailable: result.durability === 'recovery',
      error:
        result.durability === 'recovery'
          ? `练习草稿未完成 SQLite 同步；最新内容已保存在本地恢复区${result.error ? `：${result.error}` : ''}`
          : result.error || '练习草稿仍未完成持久化',
    }
  }

  readonly selectExercise = async (id: string): Promise<boolean> => {
    if (this.activeExerciseId === id) {
      return (await this.flushDraft()).durability !== 'none'
    }

    this.patch({ draftRestoreMessage: null })
    const requestId = ++this.exerciseRequestId
    if ((await this.flushDraft()).durability === 'none') return false
    if (this.exerciseRequestId !== requestId) return false

    this.patch({ loadingExercise: true, error: null })
    try {
      const [exercise, draft] = await Promise.all([
        this.dependencies.getExercise(id),
        this.dependencies.getDraft(id),
      ])
      if (this.exerciseRequestId !== requestId) return false
      if ((await this.flushDraft()).durability === 'none') return false
      if (this.exerciseRequestId !== requestId) return false

      const preferredLanguage = exercise.languages?.[0] || 'python'
      const recoveryResult = this.dependencies.readRecovery(id)
      const resolved = resolvePracticeDraft(
        draft,
        recoveryResult.entry,
        exercise.starter_code ?? '',
        preferredLanguage,
      )
      if (recoveryResult.conflict) {
        resolved.conflict = true
        resolved.autosave = false
        resolved.dirty = true
        resolved.discardRecovery = false
        resolved.recovered = true
      }
      if (resolved.discardRecovery && recoveryResult.entry) {
        this.dependencies.clearRecovery(id, {
          snapshot: resolved.snapshot,
          sourceKeys: recoveryResult.entry.sourceKeys,
        })
      }
      const recoveryFiles = this.createRecoveryFileTabs(
        exercise,
        recoveryResult.candidates.slice(1),
      )
      this.activeExerciseTitle = exercise.title
      this.coordinator.setActive(id, resolved.snapshot, resolved.baseRevision, {
        dirty: resolved.dirty,
        localVersion: resolved.localVersion,
        autosave: resolved.autosave,
        conflict: resolved.conflict,
      })
      const recoveryWriteError =
        resolved.dirty && !resolved.conflict
          ? this.dependencies.writeRecovery(
              id,
              resolved.snapshot,
              resolved.baseRevision,
              resolved.localVersion,
            )
          : null

      this.activeExerciseId = id
      this.activeRecoverySourceKeys = recoveryResult.entry?.sourceKeys ?? []
      this.draftConflict = resolved.conflict ? { current: draft } : null
      this.patch({
        currentExercise: exercise,
        code: resolved.snapshot.code,
        language: resolved.snapshot.language,
        draftDirty: resolved.dirty,
        draftError: recoveryResult.conflict
          ? recoveryFiles.opened
            ? `${recoveryResult.error ?? '检测到多个分叉的本地草稿'}；未选候选已作为普通恢复文件打开，请选择保留当前候选或重新加载已保存版本`
            : `${recoveryResult.error ?? '检测到多个分叉的本地草稿'}；${recoveryFiles.error ?? '未选候选仍保留在恢复区，但未能打开恢复文件'}`
          : resolved.conflict
            ? '检测到本地草稿与已保存版本冲突，请选择处理方式'
            : (recoveryResult.error ?? recoveryWriteError),
        draftConflict: resolved.conflict,
        draftRestoreMessage:
          resolved.recovered && !resolved.conflict
            ? '已从本地恢复区恢复上次未完成保存的练习草稿。'
            : null,
      })
      return true
    } catch (error) {
      if (this.exerciseRequestId === requestId) {
        this.patch({ error: error instanceof Error ? error.message : '加载题目失败' })
      }
      return false
    } finally {
      if (this.exerciseRequestId === requestId) this.patch({ loadingExercise: false })
    }
  }

  readonly setCode = (code: string): void => {
    this.patch({ code })
    const snapshot = { code, language: this.state.language }
    this.coordinator.update(snapshot)
    this.patch({ draftDirty: true })
    this.persistRecoverySnapshot(snapshot)
  }

  readonly setLanguage = (language: string): void => {
    const normalized = language.trim()
    if (!normalized) return
    this.patch({ language: normalized })
    const snapshot = { code: this.state.code, language: normalized }
    this.coordinator.update(snapshot)
    this.patch({ draftDirty: true })
    this.persistRecoverySnapshot(snapshot)
  }

  private persistRecoverySnapshot(snapshot: DraftSnapshot): void {
    const coordinatorState = this.coordinator.getState()
    if (!this.activeExerciseId || coordinatorState?.exerciseId !== this.activeExerciseId) return
    this.patch({
      draftError: this.dependencies.writeRecovery(
        this.activeExerciseId,
        snapshot,
        coordinatorState.baseRevision,
        coordinatorState.localVersion,
      ),
    })
  }

  private createRecoveryFileTabs(
    exercise: Exercise,
    candidates: DraftRecoveryEntry[],
  ): { opened: boolean; error: string | null } {
    if (candidates.length === 0) return { opened: true, error: null }
    const extensionByLanguage: Record<string, string> = {
      python: 'py',
      javascript: 'js',
      c: 'c',
      cpp: 'cpp',
      csharp: 'cs',
      sql: 'sql',
    }
    const base =
      exercise.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'exercise'
    const recoveryTabs: EditorTab[] = candidates.map((candidate) => {
      const sourceFingerprint = stableEditorWorkspaceHash(candidate.sourceKeys.join('\u0000'))
      const contentFingerprint = stableEditorWorkspaceHash(
        `${exercise.id}\u0000${candidate.code}\u0000${candidate.language}\u0000${candidate.baseRevision}`,
      )
      return {
        id: `practice-recovery-${contentFingerprint}-${sourceFingerprint}`,
        filename: `${base}.window-${sourceFingerprint}.recovery.${extensionByLanguage[candidate.language] ?? 'txt'}`,
        language: candidate.language || exercise.languages?.[0] || 'python',
        content: candidate.code,
        kind: 'file',
        localOnly: true,
        updatedAt: new Date(candidate.updatedAt).toISOString(),
        recoveryOriginalId: exerciseTabId(exercise.id),
      }
    })
    let error: string | null = null
    useEditorStore.setState((state) => {
      const existingIds = new Set([
        ...state.tabs.map((tab) => tab.id),
        ...state.recentlyClosedTabs.map((tab) => tab.id),
      ])
      const additions = recoveryTabs.filter((tab) => !existingIds.has(tab.id))
      if (state.tabs.length + additions.length > MAX_EDITOR_TABS) {
        error = `工作区标签已达 ${MAX_EDITOR_TABS} 个；未选候选仍保留在恢复区，未能打开恢复文件`
        return {
          persistenceError: error,
        }
      }
      return additions.length > 0 ? { tabs: [...state.tabs, ...additions], dirty: true } : state
    })
    flushPersistTabs()
    return { opened: error === null, error }
  }

  readonly clearCurrentDraft = async (): Promise<void> => {
    this.patch({ draftRestoreMessage: null })
    try {
      const cleared = await this.coordinator.clearActive(async (exerciseId, baseRevision) => {
        const result = await this.dependencies.clearDraft(exerciseId, baseRevision)
        if (result.status === 'conflict') {
          this.draftConflict = { current: result.current }
          this.patch({ draftConflict: true })
          throw new DraftConflictError()
        }
        return { revision: result.draft.revision, updatedAt: result.draft.updatedAt }
      })
      if (!cleared) return
      const coordinatorState = this.coordinator.getState()
      const hasPending = this.coordinator.hasPending()
      if (hasPending && coordinatorState?.exerciseId === cleared.exerciseId) {
        this.dependencies.writeRecovery(
          coordinatorState.exerciseId,
          coordinatorState.snapshot,
          coordinatorState.baseRevision,
          coordinatorState.localVersion,
        )
      } else {
        this.dependencies.clearRecovery(cleared.exerciseId, { snapshot: cleared.snapshot })
      }
      this.draftConflict = null
      this.patch({ draftDirty: hasPending, draftError: null, draftConflict: false })
    } catch (error) {
      this.patch({ draftError: error instanceof Error ? error.message : '清除草稿失败' })
    }
  }

  readonly keepLocalDraft = (): void => {
    const coordinatorState = this.coordinator.getState()
    if (!coordinatorState || !this.draftConflict) return
    const nextBaseRevision = this.draftConflict.current?.revision ?? 0
    this.coordinator.resolveConflict(nextBaseRevision)
    const recoveryError = this.dependencies.writeRecovery(
      coordinatorState.exerciseId,
      coordinatorState.snapshot,
      nextBaseRevision,
      coordinatorState.localVersion,
    )
    this.draftConflict = null
    this.updateRecoveryOnlyDraft(
      coordinatorState.exerciseId,
      recoveryError
        ? { durability: 'none', error: recoveryError }
        : { durability: 'recovery', error: null },
      false,
    )
    this.patch({
      draftConflict: false,
      draftError: recoveryError,
      draftDirty: true,
    })
  }

  readonly reloadPersistedDraft = (): void => {
    this.patch({ draftRestoreMessage: null })
    const exercise = this.state.currentExercise
    if (!this.activeExerciseId || !exercise || !this.draftConflict) return
    const persisted = this.draftConflict.current
    const snapshot: DraftSnapshot =
      persisted && !persisted.deleted
        ? {
            code: persisted.code,
            language: persisted.language || exercise.languages?.[0] || 'python',
          }
        : {
            code: exercise.starter_code ?? '',
            language: exercise.languages?.[0] || 'python',
          }
    const localSnapshot = this.coordinator.getState()?.snapshot
    if (localSnapshot) {
      this.dependencies.clearRecovery(this.activeExerciseId, {
        snapshot: localSnapshot,
        sourceKeys: this.activeRecoverySourceKeys,
      })
    }
    this.coordinator.setActive(this.activeExerciseId, snapshot, persisted?.revision ?? 0)
    this.clearRecoveryOnlyDraft(this.activeExerciseId)
    this.activeRecoverySourceKeys = []
    this.draftConflict = null
    this.patch({
      code: snapshot.code,
      language: snapshot.language,
      draftDirty: false,
      draftError: null,
      draftConflict: false,
    })
  }

  readonly deactivateExercise = async (
    expectedExerciseId?: string,
  ): Promise<DraftDeactivateResult> => {
    if (expectedExerciseId && this.activeExerciseId !== expectedExerciseId) {
      return {
        durability: 'database',
        error: null,
        deactivated: false,
        outcome: 'exercise-changed',
      }
    }
    this.exerciseRequestId += 1
    const result = await this.flushDraft()
    if (expectedExerciseId && this.activeExerciseId !== expectedExerciseId) {
      return { ...result, deactivated: false, outcome: 'exercise-changed' }
    }
    if (result.durability === 'none') {
      this.patch({ draftError: result.error ?? '练习草稿未能写入数据库或恢复区' })
      return { ...result, deactivated: false, outcome: 'persistence-failed' }
    }

    this.coordinator.deactivate()
    this.activeExerciseId = null
    this.activeExerciseTitle = undefined
    this.activeRecoverySourceKeys = []
    this.draftConflict = null
    this.patch({
      currentExercise: null,
      code: '',
      language: 'python',
      draftDirty: false,
      draftError: result.durability === 'database' ? null : this.state.draftError,
      draftRestoreMessage: null,
      draftConflict: false,
      draftSaving: false,
    })
    return { ...result, deactivated: true, outcome: 'deactivated' }
  }

  readonly clearError = (): void => this.patch({ error: null })

  /** Test-only lifecycle cleanup; application code keeps the singleton alive for the renderer lifetime. */
  destroy(): void {
    this.unregisterCloseHandler?.()
    this.unregisterCloseHandler = null
    this.unbindFlushLifecycle?.()
    this.unbindFlushLifecycle = null
    this.coordinator.deactivate()
    this.activeExerciseTitle = undefined
    this.listeners.clear()
  }
}

export const practiceDraftSession = new PracticeDraftSession()
