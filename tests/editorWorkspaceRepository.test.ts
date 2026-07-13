import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeEditorTab,
  deleteEditorTab,
  ensureEditorWorkspaceSchema,
  loadEditorWorkspace,
  reopenEditorTab,
  saveEditorTab,
  setActiveEditorTab,
  updateEditorTabViewState,
  type SaveEditorTabInput,
} from '../electron/db/editorWorkspaceRepository'

function tab(overrides: Partial<SaveEditorTabInput> = {}): SaveEditorTabInput {
  return {
    workspaceId: 'default',
    mutationId: 'mutation-save-a',
    clientId: 'client-a',
    id: 'tab-a',
    filename: 'a.py',
    language: 'python',
    content: 'print("a")',
    problemId: null,
    position: 0,
    baseRevision: 0,
    ...overrides,
  }
}

function canLoadNativeDatabase(): boolean {
  try {
    const probe = new Database(':memory:')
    probe.close()
    return true
  } catch (error) {
    if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) return false
    throw error
  }
}

describe.runIf(canLoadNativeDatabase())('editor workspace repository', () => {
  let database: Database.Database

  beforeEach(() => {
    database = new Database(':memory:')
    ensureEditorWorkspaceSchema(database)
  })

  afterEach(() => database.close())

  it('creates workspace metadata and loads versioned tabs', () => {
    expect(saveEditorTab(database, tab())).toMatchObject({
      status: 'saved',
      applied: true,
      generation: 1,
      tab: { workspaceId: 'default', id: 'tab-a', revision: 1, status: 'open' },
    })
    expect(setActiveEditorTab(database, 'default', 'tab-a')).toEqual({
      activeTabId: 'tab-a',
      generation: 2,
    })

    expect(loadEditorWorkspace(database)).toMatchObject({
      workspaceId: 'default',
      activeTabId: 'tab-a',
      generation: 2,
      legacyStorageVersion: 0,
      tabs: [{ id: 'tab-a', content: 'print("a")', status: 'open' }],
      recentlyClosedTabs: [],
    })
  })

  it('isolates workspaces and merges independent tabs without snapshot loss', () => {
    saveEditorTab(database, tab())
    saveEditorTab(
      database,
      tab({
        id: 'tab-b',
        mutationId: 'mutation-save-b',
        filename: 'b.py',
        content: 'print("b")',
        position: 1,
      }),
    )
    saveEditorTab(database, tab({ workspaceId: 'secondary' }))

    expect(loadEditorWorkspace(database).tabs.map((item) => item.id)).toEqual(['tab-a', 'tab-b'])
    expect(loadEditorWorkspace(database, 'secondary').tabs).toHaveLength(1)
    expect(loadEditorWorkspace(database, 'secondary').tabs[0]).toMatchObject({
      workspaceId: 'secondary',
      id: 'tab-a',
    })
  })

  it('uses revision CAS and mutation ids for idempotent retries', () => {
    saveEditorTab(database, tab())
    const next = tab({
      mutationId: 'mutation-save-a-2',
      content: 'updated',
      baseRevision: 1,
    })
    expect(saveEditorTab(database, next)).toMatchObject({
      status: 'saved',
      applied: true,
      generation: 2,
      tab: { revision: 2, content: 'updated' },
    })
    expect(saveEditorTab(database, next)).toMatchObject({
      status: 'saved',
      applied: false,
      generation: 2,
      tab: { revision: 2 },
    })
    expect(saveEditorTab(database, { ...next, content: 'different retry payload' })).toMatchObject({
      status: 'conflict',
      current: { revision: 2, content: 'updated' },
    })
    expect(
      saveEditorTab(
        database,
        tab({ mutationId: 'mutation-stale', content: 'stale', baseRevision: 1 }),
      ),
    ).toMatchObject({
      status: 'conflict',
      generation: 2,
      current: { revision: 2, content: 'updated' },
    })
  })

  it('updates view state with last-writer-wins semantics without changing revision', () => {
    saveEditorTab(database, tab())
    const first = {
      workspaceId: 'default',
      id: 'tab-a',
      mutationId: 'view-a-1',
      clientId: 'client-a',
      cursorPosition: { lineNumber: 1, column: 3 },
      scrollTop: 24,
    }
    expect(updateEditorTabViewState(database, first)).toMatchObject({
      status: 'saved',
      applied: true,
      viewState: { revision: 1, cursorPosition: first.cursorPosition, scrollTop: 24 },
    })
    expect(updateEditorTabViewState(database, first)).toMatchObject({
      status: 'saved',
      applied: false,
      viewState: { revision: 1 },
    })
    expect(updateEditorTabViewState(database, { ...first, scrollTop: 25 })).toMatchObject({
      status: 'conflict',
      current: { revision: 1, scrollTop: 24 },
    })
    updateEditorTabViewState(database, {
      ...first,
      mutationId: 'view-b-1',
      clientId: 'client-b',
      cursorPosition: null,
      scrollTop: 80,
    })

    expect(loadEditorWorkspace(database).tabs[0]).toMatchObject({
      revision: 1,
      cursorPosition: null,
      scrollTop: 80,
    })
  })

  it('keeps closed tabs recoverable and assigns reopened tabs to the tail', () => {
    saveEditorTab(database, tab())
    saveEditorTab(
      database,
      tab({
        id: 'tab-b',
        mutationId: 'mutation-save-b',
        filename: 'b.py',
        position: 3,
      }),
    )
    const closeInput = {
      workspaceId: 'default',
      id: 'tab-a',
      baseRevision: 1,
      mutationId: 'mutation-close-a',
      clientId: 'client-a',
    }
    expect(closeEditorTab(database, closeInput)).toMatchObject({
      status: 'saved',
      tab: { revision: 2, status: 'closed', content: 'print("a")' },
    })
    expect(loadEditorWorkspace(database)).toMatchObject({
      tabs: [{ id: 'tab-b' }],
      recentlyClosedTabs: [{ id: 'tab-a', revision: 2, status: 'closed' }],
    })

    const reopenInput = {
      ...closeInput,
      baseRevision: 2,
      mutationId: 'mutation-reopen-a',
    }
    expect(reopenEditorTab(database, reopenInput)).toMatchObject({
      status: 'saved',
      applied: true,
      tab: { revision: 3, status: 'open', position: 4 },
    })
    expect(reopenEditorTab(database, reopenInput)).toMatchObject({
      status: 'saved',
      applied: false,
      tab: { revision: 3, position: 4 },
    })
  })

  it('never resurrects permanently deleted tombstones', () => {
    saveEditorTab(database, tab())
    closeEditorTab(database, {
      workspaceId: 'default',
      id: 'tab-a',
      baseRevision: 1,
      mutationId: 'mutation-close-a',
      clientId: 'client-a',
    })
    expect(
      deleteEditorTab(database, {
        workspaceId: 'default',
        id: 'tab-a',
        baseRevision: 2,
        mutationId: 'mutation-delete-a',
        clientId: 'client-a',
      }),
    ).toMatchObject({ status: 'saved', tab: { revision: 3, status: 'deleted' } })

    expect(loadEditorWorkspace(database)).toMatchObject({ tabs: [], recentlyClosedTabs: [] })
    expect(
      reopenEditorTab(database, {
        workspaceId: 'default',
        id: 'tab-a',
        baseRevision: 3,
        mutationId: 'mutation-reopen-deleted-a',
        clientId: 'client-b',
      }),
    ).toMatchObject({ status: 'conflict', current: { status: 'deleted', revision: 3 } })
    expect(
      saveEditorTab(
        database,
        tab({ mutationId: 'mutation-stale-save-a', baseRevision: 1, content: 'stale' }),
      ),
    ).toMatchObject({ status: 'conflict', current: { status: 'deleted' } })
  })

  it('normalizes active-tab hints and avoids generation churn for duplicate hints', () => {
    saveEditorTab(database, tab())
    expect(setActiveEditorTab(database, 'default', 'tab-a')).toEqual({
      activeTabId: 'tab-a',
      generation: 2,
    })
    expect(setActiveEditorTab(database, 'default', 'tab-a').generation).toBe(2)
    expect(setActiveEditorTab(database, 'default', 'missing')).toEqual({
      activeTabId: null,
      generation: 3,
    })
    expect(loadEditorWorkspace(database).activeTabId).toBe('tab-a')
  })

  it('migrates the earlier draft table without losing open or closed tabs', () => {
    database.close()
    database = new Database(':memory:')
    database.exec(`
      CREATE TABLE editor_tabs (
        tab_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        language TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        problem_id TEXT,
        cursor_line INTEGER,
        cursor_column INTEGER,
        scroll_top REAL NOT NULL DEFAULT 0,
        tab_position INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        closed_at TEXT
      );
      CREATE TABLE editor_workspace_state (
        workspace_id TEXT PRIMARY KEY,
        active_tab_id TEXT,
        updated_at TEXT
      );
      INSERT INTO editor_tabs
        (tab_id, filename, language, content, tab_position, revision, updated_at, deleted)
      VALUES
        ('tab-open', 'open.py', 'python', 'open', 0, 2, '2026-01-01T00:00:00Z', 0),
        ('tab-closed', 'closed.py', 'python', 'closed', 1, 3, '2026-01-02T00:00:00Z', 1);
      INSERT INTO editor_workspace_state (workspace_id, active_tab_id)
      VALUES ('default', 'tab-open');
    `)

    ensureEditorWorkspaceSchema(database)
    expect(loadEditorWorkspace(database)).toMatchObject({
      activeTabId: 'tab-open',
      tabs: [{ id: 'tab-open', revision: 2, status: 'open' }],
      recentlyClosedTabs: [{ id: 'tab-closed', revision: 3, status: 'closed' }],
    })
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'editor_workspace_state'",
        )
        .get(),
    ).toBeUndefined()
    expect(
      saveEditorTab(
        database,
        tab({
          workspaceId: 'secondary',
          id: 'tab-open',
          mutationId: 'mutation-secondary-open',
        }),
      ),
    ).toMatchObject({ status: 'saved', tab: { workspaceId: 'secondary' } })
  })
})
