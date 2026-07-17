import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EDITOR_WORKSPACE_STORAGE_VERSION,
  legacyExerciseRecoveryTabId,
} from '../src/shared/editorWorkspaceContract'
import type { EditorWorkspaceRecord } from '../electron/db/editorWorkspaceRepository'

type TestIpcHandler = (...args: unknown[]) => Promise<unknown>
type BetterSqlite3 = typeof import('better-sqlite3')
type BetterSqlite3Database = import('better-sqlite3').Database

const ipcState = vi.hoisted(() => ({
  handlers: {} as Record<string, TestIpcHandler>,
  database: null as BetterSqlite3Database | null,
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcState.handlers[channel] = async (...args: unknown[]) => handler(...args)
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}))

vi.mock('../electron/db/index', () => ({
  getDB: () => {
    if (!ipcState.database) throw new Error('test database is not initialized')
    return ipcState.database
  },
}))

function loadNativeDatabase(): BetterSqlite3 | null {
  try {
    const require = createRequire(import.meta.url)
    const Database = require('better-sqlite3') as BetterSqlite3
    const probe = new Database(':memory:')
    probe.close()
    return Database
  } catch {
    return null
  }
}

const Database = loadNativeDatabase()
const { registerEditorWorkspaceIPC } = await import('../electron/ipc/editorWorkspace')
const event = { sender: { id: 1 } }

describe.runIf(Database !== null)('editor workspace IPC and repository contract', () => {
  beforeEach(() => {
    ipcState.database = new Database!(':memory:')
    registerEditorWorkspaceIPC()
  })

  afterEach(() => {
    ipcState.database?.close()
    ipcState.database = null
  })

  it('accepts v3 and atomically splits legacy exercise code into an ordinary recovery file', async () => {
    const result = (await ipcState.handlers['editor-workspace-migrate-legacy'](event, {
      workspaceId: 'default',
      mutationId: 'ipc-v3-migration',
      clientId: 'ipc-integration',
      storageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
      activeTabId: 'exercise-a',
      tabs: [
        {
          id: 'exercise-a',
          filename: 'exercise.py',
          language: 'python',
          content: 'valuable legacy code',
          kind: 'exercise',
          problemId: 'exercise-a',
          cursorPosition: { lineNumber: 2, column: 3 },
          scrollTop: 12,
          position: 0,
          status: 'open',
        },
      ],
    })) as { workspace: EditorWorkspaceRecord; recoveredTabIds: string[] }
    const recoveryId = legacyExerciseRecoveryTabId({
      id: 'exercise-a',
      filename: 'exercise.py',
      language: 'python',
      content: 'valuable legacy code',
      problemId: 'exercise-a',
    })

    expect(result.workspace).toMatchObject({
      legacyStorageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
      activeTabId: 'exercise-a',
    })
    expect(result.workspace.tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'exercise-a', kind: 'exercise', content: '' }),
        expect.objectContaining({ id: recoveryId, kind: 'file', content: 'valuable legacy code' }),
      ]),
    )
    expect(result.recoveredTabIds).toContain(recoveryId)
  })

  it('keeps exercise code out of editor_tabs on new save requests', async () => {
    const result = (await ipcState.handlers['editor-tab-save'](event, {
      workspaceId: 'default',
      mutationId: 'ipc-exercise-save',
      clientId: 'ipc-integration',
      id: 'exercise-save',
      filename: 'save.py',
      language: 'python',
      content: 'draft authority only',
      kind: 'exercise',
      problemId: 'exercise-save',
      position: 0,
      baseRevision: 0,
    })) as { tab: { kind: string; content: string } }

    expect(result.tab).toMatchObject({ kind: 'exercise', content: '' })
    expect(
      ipcState.database
        ?.prepare("SELECT content FROM editor_tabs WHERE tab_id = 'exercise-save'")
        .get(),
    ).toEqual({ content: '' })
  })
})
