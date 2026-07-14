import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { getDB } from '../db/index'
import {
  DEFAULT_EDITOR_WORKSPACE_ID,
  closeEditorTab,
  deleteEditorTab,
  loadEditorWorkspace,
  migrateLegacyEditorWorkspace,
  reopenEditorTab,
  saveEditorTab,
  setActiveEditorTab,
  updateEditorTabViewState,
  type EditorTabMutationResult,
  type EditorTabViewStateMutationResult,
  type EditorTabKind,
  type SaveEditorTabInput,
  type MigrateLegacyEditorWorkspaceInput,
  type UpdateEditorTabViewStateInput,
  type VersionedEditorTabMutationInput,
} from '../db/editorWorkspaceRepository'
import { trackPerformance } from '../utils/perfMonitor'

const MAX_WORKSPACE_ID_LENGTH = 100
const MAX_TAB_ID_LENGTH = 200
const MAX_MUTATION_ID_LENGTH = 200
const MAX_CLIENT_ID_LENGTH = 200
const MAX_FILENAME_LENGTH = 255
const MAX_LANGUAGE_LENGTH = 40
const MAX_CONTENT_LENGTH = 5_000_000
const MAX_MIGRATION_TABS = 60
const MAX_MIGRATION_TOTAL_CONTENT = 10_000_000

type WorkspaceMutationKind = 'saved' | 'closed' | 'reopened' | 'deleted'

interface MutationIdentity {
  workspaceId: string
  mutationId: string
  clientId: string
}

function requiredString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`参数无效: ${name}`)
  if (value.length > maxLength) throw new Error(`${name} 超过长度限制`)
  return value.trim()
}

function safeRevision(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error('参数无效: baseRevision')
  }
  return Number(value)
}

function safePosition(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('参数无效: position')
  return Number(value)
}

function sanitizeTabKind(value: unknown): EditorTabKind {
  if (value === undefined || value === null || value === 'file') return 'file'
  if (value === 'problem' || value === 'exercise') return value
  throw new Error('参数无效: kind')
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数无效')
  return value as Record<string, unknown>
}

function sanitizeWorkspaceId(value: unknown): string {
  const workspaceId = requiredString(value, 'workspaceId', MAX_WORKSPACE_ID_LENGTH)
  if (workspaceId !== DEFAULT_EDITOR_WORKSPACE_ID) {
    throw new Error('参数无效: workspaceId')
  }
  return workspaceId
}

function sanitizeIdentity(value: Record<string, unknown>): MutationIdentity {
  return {
    workspaceId: sanitizeWorkspaceId(value.workspaceId),
    mutationId: requiredString(value.mutationId, 'mutationId', MAX_MUTATION_ID_LENGTH),
    clientId: requiredString(value.clientId, 'clientId', MAX_CLIENT_ID_LENGTH),
  }
}

function sanitizeSaveInput(value: unknown): SaveEditorTabInput {
  const input = requireObject(value)
  if (typeof input.content !== 'string') throw new Error('参数无效: content')
  if (input.content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`工作区标签超过 ${MAX_CONTENT_LENGTH} 字符，无法保存`)
  }
  const problemId =
    input.problemId === undefined || input.problemId === null
      ? null
      : requiredString(input.problemId, 'problemId', MAX_TAB_ID_LENGTH)
  return {
    ...sanitizeIdentity(input),
    id: requiredString(input.id, 'id', MAX_TAB_ID_LENGTH),
    filename: requiredString(input.filename, 'filename', MAX_FILENAME_LENGTH),
    language: requiredString(input.language, 'language', MAX_LANGUAGE_LENGTH),
    content: input.content,
    kind: sanitizeTabKind(input.kind),
    problemId,
    position: safePosition(input.position),
    baseRevision: safeRevision(input.baseRevision),
  }
}

function sanitizeLegacyMigration(value: unknown): MigrateLegacyEditorWorkspaceInput {
  const input = requireObject(value)
  if (input.storageVersion !== 2) throw new Error('参数无效: storageVersion')
  if (!Array.isArray(input.tabs) || input.tabs.length > MAX_MIGRATION_TABS) {
    throw new Error('参数无效: tabs')
  }
  let totalContent = 0
  const tabs = input.tabs.map((value, position) => {
    const tab = requireObject(value)
    if (typeof tab.content !== 'string') throw new Error('参数无效: content')
    totalContent += tab.content.length
    if (tab.content.length > MAX_CONTENT_LENGTH || totalContent > MAX_MIGRATION_TOTAL_CONTENT) {
      throw new Error('旧工作区内容超过迁移上限')
    }
    if (tab.status !== 'open' && tab.status !== 'closed') throw new Error('参数无效: status')
    const cursor = tab.cursorPosition
    if (
      cursor !== null &&
      (!cursor ||
        typeof cursor !== 'object' ||
        !Number.isSafeInteger((cursor as { lineNumber?: unknown }).lineNumber) ||
        Number((cursor as { lineNumber: number }).lineNumber) < 1 ||
        !Number.isSafeInteger((cursor as { column?: unknown }).column) ||
        Number((cursor as { column: number }).column) < 1)
    ) {
      throw new Error('参数无效: cursorPosition')
    }
    if (!Number.isFinite(tab.scrollTop) || Number(tab.scrollTop) < 0) {
      throw new Error('参数无效: scrollTop')
    }
    const problemId =
      tab.problemId === undefined || tab.problemId === null
        ? null
        : requiredString(tab.problemId, 'problemId', MAX_TAB_ID_LENGTH)
    return {
      id: requiredString(tab.id, 'id', MAX_TAB_ID_LENGTH),
      filename: requiredString(tab.filename, 'filename', MAX_FILENAME_LENGTH),
      language: requiredString(tab.language, 'language', MAX_LANGUAGE_LENGTH),
      content: tab.content,
      kind: sanitizeTabKind(tab.kind),
      problemId,
      cursorPosition: cursor as MigrateLegacyEditorWorkspaceInput['tabs'][number]['cursorPosition'],
      scrollTop: Number(tab.scrollTop),
      position: tab.position === undefined ? position : safePosition(tab.position),
      status: tab.status as 'open' | 'closed',
    }
  })
  const activeTabId =
    input.activeTabId === null
      ? null
      : requiredString(input.activeTabId, 'activeTabId', MAX_TAB_ID_LENGTH)
  return {
    ...sanitizeIdentity(input),
    storageVersion: 2,
    activeTabId,
    tabs,
  }
}

function sanitizeViewStateInput(value: unknown): UpdateEditorTabViewStateInput {
  const input = requireObject(value)
  if (!Number.isFinite(input.scrollTop) || Number(input.scrollTop) < 0) {
    throw new Error('参数无效: scrollTop')
  }
  const cursor = input.cursorPosition
  if (
    cursor !== null &&
    (!cursor ||
      typeof cursor !== 'object' ||
      !Number.isSafeInteger((cursor as { lineNumber?: unknown }).lineNumber) ||
      Number((cursor as { lineNumber: number }).lineNumber) < 1 ||
      !Number.isSafeInteger((cursor as { column?: unknown }).column) ||
      Number((cursor as { column: number }).column) < 1)
  ) {
    throw new Error('参数无效: cursorPosition')
  }
  return {
    ...sanitizeIdentity(input),
    id: requiredString(input.id, 'id', MAX_TAB_ID_LENGTH),
    cursorPosition: cursor as UpdateEditorTabViewStateInput['cursorPosition'],
    scrollTop: Number(input.scrollTop),
  }
}

function sanitizeVersionedMutation(value: unknown): VersionedEditorTabMutationInput {
  const input = requireObject(value)
  return {
    ...sanitizeIdentity(input),
    id: requiredString(input.id, 'id', MAX_TAB_ID_LENGTH),
    baseRevision: safeRevision(input.baseRevision, 1),
  }
}

function broadcastMutation(
  event: IpcMainInvokeEvent,
  kind: WorkspaceMutationKind,
  identity: MutationIdentity,
  result: Extract<EditorTabMutationResult, { status: 'saved' }>,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.webContents.id === event.sender.id || window.webContents.isDestroyed()) continue
    window.webContents.send('editor-workspace-changed', {
      sourceClientId: identity.clientId,
      workspaceId: identity.workspaceId,
      kind,
      tab: result.tab,
      generation: result.generation,
    })
  }
}

function broadcastAppliedMutation(
  event: IpcMainInvokeEvent,
  kind: WorkspaceMutationKind,
  identity: MutationIdentity,
  result: EditorTabMutationResult,
): void {
  if (result.status === 'saved' && result.applied) {
    broadcastMutation(event, kind, identity, result)
  }
}

function broadcastAppliedViewState(
  event: IpcMainInvokeEvent,
  identity: MutationIdentity,
  result: EditorTabViewStateMutationResult,
): void {
  if (result.status !== 'saved' || !result.applied) return
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.webContents.id === event.sender.id || window.webContents.isDestroyed()) continue
    window.webContents.send('editor-workspace-changed', {
      sourceClientId: identity.clientId,
      workspaceId: identity.workspaceId,
      kind: 'view-state',
      viewState: result.viewState,
      generation: result.generation,
    })
  }
}

export function registerEditorWorkspaceIPC(): void {
  ipcMain.handle(
    'editor-workspace-load',
    trackPerformance('editor-workspace-load', (_event, value: unknown) => {
      const input = requireObject(value)
      return loadEditorWorkspace(getDB(), sanitizeWorkspaceId(input.workspaceId))
    }),
  )
  ipcMain.handle(
    'editor-workspace-migrate-legacy',
    trackPerformance('editor-workspace-migrate-legacy', (_event, value: unknown) =>
      migrateLegacyEditorWorkspace(getDB(), sanitizeLegacyMigration(value)),
    ),
  )
  ipcMain.handle(
    'editor-tab-save',
    trackPerformance('editor-tab-save', (event, value: unknown) => {
      const input = sanitizeSaveInput(value)
      const result = saveEditorTab(getDB(), input)
      broadcastAppliedMutation(event, 'saved', input, result)
      return result
    }),
  )
  ipcMain.handle(
    'editor-tab-update-view-state',
    trackPerformance('editor-tab-update-view-state', (event, value: unknown) => {
      const input = sanitizeViewStateInput(value)
      const result = updateEditorTabViewState(getDB(), input)
      broadcastAppliedViewState(event, input, result)
      return result
    }),
  )
  ipcMain.handle(
    'editor-tab-close',
    trackPerformance('editor-tab-close', (event, value: unknown) => {
      const input = sanitizeVersionedMutation(value)
      const result = closeEditorTab(getDB(), input)
      broadcastAppliedMutation(event, 'closed', input, result)
      return result
    }),
  )
  ipcMain.handle(
    'editor-tab-reopen',
    trackPerformance('editor-tab-reopen', (event, value: unknown) => {
      const input = sanitizeVersionedMutation(value)
      const result = reopenEditorTab(getDB(), input)
      broadcastAppliedMutation(event, 'reopened', input, result)
      return result
    }),
  )
  ipcMain.handle(
    'editor-tab-delete',
    trackPerformance('editor-tab-delete', (event, value: unknown) => {
      const input = sanitizeVersionedMutation(value)
      const result = deleteEditorTab(getDB(), input)
      broadcastAppliedMutation(event, 'deleted', input, result)
      return result
    }),
  )
  ipcMain.handle(
    'editor-workspace-set-active',
    trackPerformance('editor-workspace-set-active', (_event, value: unknown) => {
      const input = requireObject(value)
      const workspaceId = sanitizeWorkspaceId(input.workspaceId)
      const activeTabId =
        input.activeTabId === null
          ? null
          : requiredString(input.activeTabId, 'activeTabId', MAX_TAB_ID_LENGTH)
      return setActiveEditorTab(getDB(), workspaceId, activeTabId)
    }),
  )
}
