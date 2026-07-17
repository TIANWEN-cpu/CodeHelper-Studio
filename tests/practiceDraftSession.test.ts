import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPracticeDraftCloseWarning,
  PracticeDraftSession,
  type PracticeDraftSessionDependencies,
} from '../src/services/practiceDraftSession'
import type { Exercise, PracticeDraft } from '../src/services/practiceService'
import type { DraftRecoveryEntry } from '../src/utils/draftRecovery'
import { MAX_EDITOR_TABS, useEditorStore } from '../src/stores/editorStore'

function exercise(id: string): Exercise {
  return {
    id,
    title: `Exercise ${id}`,
    track_id: 'test',
    difficulty: 'easy',
    prompt: 'Prompt',
    starter_code: `starter ${id}`,
    languages: ['python'],
    source_type: 'exercise',
  }
}

function savedDraft(exerciseId: string, code: string, revision: number): PracticeDraft {
  return {
    exerciseId,
    title: exerciseId,
    code,
    language: 'python',
    revision,
    updatedAt: `2026-01-01T00:00:0${revision}.000Z`,
    deleted: false,
  }
}

function recovery(
  code: string,
  sourceKey: string,
  overrides: Partial<DraftRecoveryEntry> = {},
): DraftRecoveryEntry {
  return {
    code,
    language: 'python',
    baseRevision: 0,
    localVersion: 2,
    updatedAt: 123,
    legacy: false,
    sourceKey,
    sourceKeys: [sourceKey],
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

type CloseHandler = Parameters<PracticeDraftSessionDependencies['registerCloseHandler']>[1]

function dependencies(
  overrides: Partial<PracticeDraftSessionDependencies> = {},
): PracticeDraftSessionDependencies & { closeHandler: () => CloseHandler | null } {
  let registeredCloseHandler: CloseHandler | null = null
  const base: PracticeDraftSessionDependencies = {
    getExercise: vi.fn(async (id: string) => exercise(id)),
    getDraft: vi.fn(async () => null),
    saveDraft: vi.fn(async (exerciseId, code, _language, baseRevision) => ({
      status: 'saved' as const,
      draft: savedDraft(exerciseId, code, baseRevision + 1),
    })),
    clearDraft: vi.fn(async (exerciseId, baseRevision) => ({
      status: 'saved' as const,
      draft: { ...savedDraft(exerciseId, '', baseRevision + 1), deleted: true },
    })),
    readRecovery: vi.fn(() => ({
      entry: null,
      candidates: [],
      conflict: false,
      error: null,
    })),
    writeRecovery: vi.fn(() => null),
    clearRecovery: vi.fn(),
    registerCloseHandler: vi.fn((_id, handler) => {
      registeredCloseHandler = handler
      return () => {
        if (registeredCloseHandler === handler) registeredCloseHandler = null
      }
    }),
    bindFlushLifecycle: vi.fn(() => vi.fn()),
    ...overrides,
  }
  return Object.assign(base, { closeHandler: () => registeredCloseHandler })
}

const sessions: PracticeDraftSession[] = []

beforeEach(() => {
  useEditorStore.setState({
    tabs: [
      {
        id: 'welcome',
        filename: 'welcome.py',
        language: 'python',
        content: 'welcome',
        kind: 'file',
      },
    ],
    activeTabId: 'welcome',
    recentlyClosedTabs: [],
    hydrated: true,
    dirty: false,
    persistenceError: null,
  })
})

afterEach(() => {
  sessions.splice(0).forEach((session) => session.destroy())
  vi.restoreAllMocks()
})

describe('PracticeDraftSession', () => {
  it('keeps an in-memory draft across view unsubscribe/remount when both durable writes fail', async () => {
    const deps = dependencies({
      saveDraft: vi.fn(async () => {
        throw new Error('SQLite offline')
      }),
      writeRecovery: vi.fn(() => 'localStorage quota exceeded'),
    })
    const session = new PracticeDraftSession(deps, {
      autosaveDelayMs: 60_000,
      registerLifecycle: true,
    })
    sessions.push(session)

    expect(await session.selectExercise('a')).toBe(true)
    const firstViewListener = vi.fn()
    const unsubscribe = session.subscribe(firstViewListener)
    session.setCode('valuable in-memory code')
    unsubscribe()

    await expect(session.flushDraft()).resolves.toMatchObject({ durability: 'none' })
    expect(session.getSnapshot()).toMatchObject({
      currentExercise: { id: 'a' },
      code: 'valuable in-memory code',
      draftDirty: true,
      draftError: expect.stringContaining('localStorage quota exceeded'),
    })

    const remountedViewListener = vi.fn()
    const unsubscribeRemounted = session.subscribe(remountedViewListener)
    expect(session.getSnapshot().code).toBe('valuable in-memory code')
    await expect(session.selectExercise('a')).resolves.toBe(false)
    expect(session.getSnapshot().code).toBe('valuable in-memory code')
    unsubscribeRemounted()

    const closeHandler = deps.closeHandler()
    expect(closeHandler).not.toBeNull()
    await expect(closeHandler?.()).resolves.toMatchObject({
      ok: false,
      recoveryAvailable: false,
      error: expect.stringContaining('SQLite offline'),
    })
    expect(session.getSnapshot().code).toBe('valuable in-memory code')
  })

  it('reports recovery-only app close honestly after the practice view is gone', async () => {
    const deps = dependencies({
      saveDraft: vi.fn(async () => {
        throw new Error('SQLite offline')
      }),
      writeRecovery: vi.fn(() => null),
    })
    const session = new PracticeDraftSession(deps, {
      autosaveDelayMs: 60_000,
      registerLifecycle: true,
    })
    sessions.push(session)
    await session.selectExercise('a')
    const unsubscribe = session.subscribe(vi.fn())
    session.setCode('recovery-only code')
    unsubscribe()

    await expect(deps.closeHandler()?.()).resolves.toEqual({
      ok: false,
      recoveryAvailable: true,
      error: '练习草稿未完成 SQLite 同步；最新内容已保存在本地恢复区：SQLite offline',
    })
    expect(session.getSnapshot()).toMatchObject({
      code: 'recovery-only code',
      draftDirty: true,
      draftError: 'SQLite offline',
    })
  })

  it('flushes the old exercise with its current title before a normal switch', async () => {
    const deps = dependencies()
    const session = new PracticeDraftSession(deps, {
      autosaveDelayMs: 60_000,
      registerLifecycle: false,
    })
    sessions.push(session)
    await session.selectExercise('a')
    session.setCode('saved before switch')

    await expect(session.selectExercise('b')).resolves.toBe(true)
    expect(deps.saveDraft).toHaveBeenCalledWith(
      'a',
      'saved before switch',
      'python',
      0,
      'Exercise a',
    )
    expect(session.getSnapshot()).toMatchObject({ currentExercise: { id: 'b' }, code: 'starter b' })
  })

  it('keeps a visible recovery-only warning after switching to another exercise', async () => {
    const deps = dependencies({
      saveDraft: vi.fn(async () => {
        throw new Error('SQLite offline')
      }),
      writeRecovery: vi.fn(() => null),
    })
    const session = new PracticeDraftSession(deps, {
      autosaveDelayMs: 60_000,
      registerLifecycle: false,
    })
    sessions.push(session)
    await session.selectExercise('a')
    session.setCode('survives in recovery only')

    await expect(session.selectExercise('b')).resolves.toBe(true)

    expect(session.getSnapshot()).toMatchObject({
      currentExercise: { id: 'b' },
      code: 'starter b',
      draftError: null,
      draftDegradedMessage: '“Exercise a”的最新草稿仅保存在本地恢复区，尚未写入 SQLite。',
    })
    expect(session.getRecoveryOnlyDraftCloseState('a')).toEqual({
      durability: 'recovery',
      conflict: false,
      error: 'SQLite offline',
    })
    expect(session.getRecoveryOnlyDraftCloseState('b')).toBeNull()
    expect(getPracticeDraftCloseWarning(session.getRecoveryOnlyDraftCloseState('a')!)).toContain(
      '未能写入 SQLite',
    )
  })

  it('uses distinct close warnings for revision conflicts and unavailable SQLite', () => {
    const conflictWarning = getPracticeDraftCloseWarning({
      durability: 'recovery',
      conflict: true,
      error: '草稿版本冲突',
    })
    expect(conflictWarning).toContain('未处理的版本冲突')
    expect(conflictWarning).toContain('保留本地草稿或重新加载已保存版本')
    expect(conflictWarning).not.toContain('SQLite 草稿保存不可用')

    const unavailableWarning = getPracticeDraftCloseWarning({
      durability: 'recovery',
      conflict: false,
      error: 'database is closed',
    })
    expect(unavailableWarning).toContain('未能写入 SQLite')
    expect(unavailableWarning).toContain('database is closed')
    expect(unavailableWarning).not.toContain('版本冲突')

    expect(
      getPracticeDraftCloseWarning({
        durability: 'database',
        conflict: false,
        error: null,
      }),
    ).toBeNull()
  })

  it('keeps an inactive conflict queryable without claiming SQLite is unavailable', async () => {
    const deps = dependencies({
      saveDraft: vi.fn(async () => ({
        status: 'conflict' as const,
        current: savedDraft('a', 'database branch', 4),
      })),
    })
    const session = new PracticeDraftSession(deps, {
      autosaveDelayMs: 60_000,
      registerLifecycle: false,
    })
    sessions.push(session)
    await session.selectExercise('a')
    session.setCode('local branch')

    await expect(session.flushDraft()).resolves.toMatchObject({
      durability: 'recovery',
      conflict: true,
      error: expect.stringContaining('草稿版本冲突'),
    })
    expect(session.getSnapshot()).toMatchObject({
      draftConflict: true,
      draftDegradedMessage:
        '“Exercise a”草稿存在未处理的版本冲突；最新本地内容仅保存在恢复区，尚未写入 SQLite。',
    })

    await expect(session.selectExercise('b')).resolves.toBe(true)
    expect(session.getSnapshot()).toMatchObject({
      currentExercise: { id: 'b' },
      draftConflict: false,
      draftDegradedMessage:
        '“Exercise a”草稿存在未处理的版本冲突；最新本地内容仅保存在恢复区，尚未写入 SQLite。',
    })
    expect(session.getRecoveryOnlyDraftCloseState('a')).toMatchObject({
      durability: 'recovery',
      conflict: true,
    })
  })

  it('does not clear a pending recovery failure until the newest code reaches SQLite', async () => {
    const firstSave = deferred<Awaited<ReturnType<PracticeDraftSessionDependencies['saveDraft']>>>()
    const secondSave =
      deferred<Awaited<ReturnType<PracticeDraftSessionDependencies['saveDraft']>>>()
    const saveDraft = vi
      .fn<PracticeDraftSessionDependencies['saveDraft']>()
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise)
    const writeRecovery = vi.fn(
      (_exerciseId: string, snapshot: { code: string }, baseRevision: number) =>
        snapshot.code === 'B newest' && baseRevision === 1 ? 'pending recovery write failed' : null,
    )
    const deps = dependencies({ saveDraft, writeRecovery })
    const session = new PracticeDraftSession(deps, {
      autosaveDelayMs: 60_000,
      registerLifecycle: false,
    })
    sessions.push(session)
    await session.selectExercise('a')
    session.setCode('A saving')
    const flush = session.flushDraft()
    await vi.waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1))
    session.setCode('B newest')

    firstSave.resolve({ status: 'saved', draft: savedDraft('a', 'A saving', 1) })
    await vi.waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2))
    expect(session.getSnapshot()).toMatchObject({
      code: 'B newest',
      draftDirty: true,
      draftError: 'pending recovery write failed',
    })

    secondSave.resolve({ status: 'saved', draft: savedDraft('a', 'B newest', 2) })
    await expect(flush).resolves.toEqual({ durability: 'database', error: null })
    expect(session.getSnapshot()).toMatchObject({ draftDirty: false, draftError: null })
  })

  it('opens unselected divergent recovery candidates as deterministic local files', async () => {
    const selected = recovery('A branch', 'session-a')
    const unselected = recovery('B branch', 'session-b')
    const deps = dependencies({
      readRecovery: vi.fn(() => ({
        entry: selected,
        candidates: [selected, unselected],
        conflict: true,
        error: '检测到 2 个分叉的练习草稿恢复候选',
      })),
    })
    const session = new PracticeDraftSession(deps, {
      autosaveDelayMs: 60_000,
      registerLifecycle: false,
    })
    sessions.push(session)

    await expect(session.selectExercise('a')).resolves.toBe(true)
    expect(session.getSnapshot()).toMatchObject({
      code: 'A branch',
      draftConflict: true,
      draftError: expect.stringContaining('未选候选已作为普通恢复文件打开'),
    })
    expect(
      useEditorStore
        .getState()
        .tabs.find(
          (tab) => tab.filename.includes('.window-') && tab.filename.includes('.recovery.'),
        ),
    ).toMatchObject({ content: 'B branch', kind: 'file', localOnly: true })
  })

  it('states that candidates remain in recovery when the workspace cannot open recovery files', async () => {
    useEditorStore.setState({
      tabs: Array.from({ length: MAX_EDITOR_TABS }, (_, index) => ({
        id: `full-${index}`,
        filename: `full-${index}.py`,
        language: 'python',
        content: '',
        kind: 'file' as const,
      })),
      activeTabId: 'full-0',
    })
    const selected = recovery('A branch', 'session-a')
    const unselected = recovery('B branch', 'session-b')
    const deps = dependencies({
      readRecovery: vi.fn(() => ({
        entry: selected,
        candidates: [selected, unselected],
        conflict: true,
        error: '检测到 2 个分叉的练习草稿恢复候选',
      })),
    })
    const session = new PracticeDraftSession(deps, {
      autosaveDelayMs: 60_000,
      registerLifecycle: false,
    })
    sessions.push(session)

    await session.selectExercise('a')
    expect(session.getSnapshot().draftError).toContain('未选候选仍保留在恢复区')
    expect(session.getSnapshot().draftError).not.toContain('已作为普通恢复文件打开')
  })
})
