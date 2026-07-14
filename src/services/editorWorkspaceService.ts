import { invoke, onEvent } from './ipc'

export const DEFAULT_EDITOR_WORKSPACE_ID = 'default'

export type EditorTabKind = 'file' | 'problem' | 'exercise'
export type EditorTabStatus = 'open' | 'closed' | 'deleted'
export type EditorWorkspaceMutationKind = 'saved' | 'view-state' | 'closed' | 'reopened' | 'deleted'

export interface EditorTabRecord {
  workspaceId: string
  id: string
  filename: string
  language: string
  content: string
  kind: EditorTabKind
  problemId: string | null
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
  position: number
  status: EditorTabStatus
  revision: number
  updatedAt: string
  viewUpdatedAt: string
  closedAt: string | null
  deletedAt: string | null
}

export interface EditorWorkspaceRecord {
  workspaceId: string
  tabs: EditorTabRecord[]
  activeTabId: string | null
  recentlyClosedTabs: EditorTabRecord[]
  generation: number
  legacyStorageVersion: number
}

export interface EditorMutationIdentity {
  workspaceId: string
  mutationId: string
  clientId: string
}

export interface SaveEditorTabInput extends EditorMutationIdentity {
  id: string
  filename: string
  language: string
  content: string
  kind?: EditorTabKind
  problemId?: string | null
  position: number
  baseRevision: number
}

export interface UpdateEditorTabViewStateInput extends EditorMutationIdentity {
  id: string
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
}

export interface VersionedEditorTabMutationInput extends EditorMutationIdentity {
  id: string
  baseRevision: number
}

export interface EditorTabViewStateRecord {
  workspaceId: string
  id: string
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
  status: EditorTabStatus
  revision: number
  viewUpdatedAt: string
}

export type EditorTabMutationResult =
  | {
      status: 'saved'
      tab: EditorTabRecord
      generation: number
      applied: boolean
    }
  | {
      status: 'conflict'
      current: EditorTabRecord | null
      generation: number
    }

export type EditorTabViewStateMutationResult =
  | {
      status: 'saved'
      viewState: EditorTabViewStateRecord
      generation: number
      applied: boolean
    }
  | {
      status: 'conflict'
      current: EditorTabViewStateRecord | null
      generation: number
    }

export interface EditorWorkspaceTabChangedEvent {
  sourceClientId: string
  workspaceId: string
  kind: Exclude<EditorWorkspaceMutationKind, 'view-state'>
  tab: EditorTabRecord
  generation: number
}

export interface EditorWorkspaceViewStateChangedEvent {
  sourceClientId: string
  workspaceId: string
  kind: 'view-state'
  viewState: EditorTabViewStateRecord
  generation: number
}

export type EditorWorkspaceChangedEvent =
  | EditorWorkspaceTabChangedEvent
  | EditorWorkspaceViewStateChangedEvent

export interface SetActiveEditorTabResult {
  activeTabId: string | null
  generation: number
}

export interface LegacyEditorTabInput {
  id: string
  filename: string
  language: string
  content: string
  kind?: EditorTabKind
  problemId?: string | null
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
  position: number
  status: 'open' | 'closed'
}

export interface MigrateLegacyEditorWorkspaceInput extends EditorMutationIdentity {
  storageVersion: number
  activeTabId: string | null
  tabs: LegacyEditorTabInput[]
}

export interface MigrateLegacyEditorWorkspaceResult {
  status: 'migrated' | 'already-migrated'
  workspace: EditorWorkspaceRecord
  recoveredTabIds: string[]
  recoveredTabMappings: Record<string, string>
}

export function loadEditorWorkspace(
  workspaceId: string = DEFAULT_EDITOR_WORKSPACE_ID,
): Promise<EditorWorkspaceRecord> {
  return invoke<EditorWorkspaceRecord>('editor-workspace-load', { workspaceId })
}

export function migrateLegacyEditorWorkspace(
  input: MigrateLegacyEditorWorkspaceInput,
): Promise<MigrateLegacyEditorWorkspaceResult> {
  return invoke<MigrateLegacyEditorWorkspaceResult>('editor-workspace-migrate-legacy', input)
}

export function saveEditorTab(input: SaveEditorTabInput): Promise<EditorTabMutationResult> {
  return invoke<EditorTabMutationResult>('editor-tab-save', input)
}

export function updateEditorTabViewState(
  input: UpdateEditorTabViewStateInput,
): Promise<EditorTabViewStateMutationResult> {
  return invoke<EditorTabViewStateMutationResult>('editor-tab-update-view-state', input)
}

export function closeEditorTab(
  input: VersionedEditorTabMutationInput,
): Promise<EditorTabMutationResult> {
  return invoke<EditorTabMutationResult>('editor-tab-close', input)
}

export function reopenEditorTab(
  input: VersionedEditorTabMutationInput,
): Promise<EditorTabMutationResult> {
  return invoke<EditorTabMutationResult>('editor-tab-reopen', input)
}

export function deleteEditorTab(
  input: VersionedEditorTabMutationInput,
): Promise<EditorTabMutationResult> {
  return invoke<EditorTabMutationResult>('editor-tab-delete', input)
}

export function setActiveEditorTab(
  activeTabId: string | null,
  workspaceId: string = DEFAULT_EDITOR_WORKSPACE_ID,
): Promise<SetActiveEditorTabResult> {
  return invoke<SetActiveEditorTabResult>('editor-workspace-set-active', {
    workspaceId,
    activeTabId,
  })
}

export function onEditorWorkspaceChanged(
  callback: (event: EditorWorkspaceChangedEvent) => void,
): () => void {
  return onEvent('editor-workspace-changed', (event) =>
    callback(event as EditorWorkspaceChangedEvent),
  )
}
