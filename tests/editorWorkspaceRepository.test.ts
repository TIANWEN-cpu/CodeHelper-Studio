import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  EDITOR_WORKSPACE_SCHEMA_VERSION,
  EDITOR_WORKSPACE_STORAGE_VERSION,
  closeEditorTab,
  deleteEditorTab,
  ensureEditorWorkspaceSchema,
  loadEditorWorkspace,
  migrateLegacyEditorWorkspace,
  reopenEditorTab,
  saveEditorTab,
  setActiveEditorTab,
  updateEditorTabViewState,
  type SaveEditorTabInput,
} from '../electron/db/editorWorkspaceRepository'
import { legacyExerciseRecoveryTabId } from '../src/shared/editorWorkspaceContract'

type BetterSqlite3 = typeof import('better-sqlite3')
type BetterSqlite3Database = import('better-sqlite3').Database

function loadNativeDatabase(): BetterSqlite3 | null {
  try {
    // Dynamic require so unit CI with `--ignore-scripts` can skip instead of
    // failing the whole suite when better-sqlite3 bindings were never built.
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

describe.runIf(Database !== null)('editor workspace repository', () => {
  let database: BetterSqlite3Database

  beforeEach(() => {
    database = new Database!(':memory:')
    ensureEditorWorkspaceSchema(database)
  })

  afterEach(() => database.close())

  it('records the monotonic editor workspace schema version', () => {
    expect(
      database
        .prepare("SELECT version FROM schema_migrations WHERE component = 'editor-workspace'")
        .get(),
    ).toEqual({ version: EDITOR_WORKSPACE_SCHEMA_VERSION })
  })

  it('refuses a database marked with a newer editor workspace schema', () => {
    const future = new Database!(':memory:')
    try {
      future.exec(`
        CREATE TABLE schema_migrations (
          component TEXT PRIMARY KEY,
          version INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO schema_migrations (component, version, updated_at)
        VALUES ('editor-workspace', ${EDITOR_WORKSPACE_SCHEMA_VERSION + 1}, '2026-07-15T00:00:00Z');
      `)
      expect(() => ensureEditorWorkspaceSchema(future)).toThrow('newer than supported')
    } finally {
      future.close()
    }
  })

  it('creates workspace metadata and loads versioned tabs', () => {
    expect(saveEditorTab(database, tab())).toMatchObject({
      status: 'saved',
      applied: true,
      generation: 1,
      tab: { workspaceId: 'default', id: 'tab-a', revision: 1, status: 'open' },
    })
    expect(setActiveEditorTab(database, 'default', 'tab-a')).toEqual({
      activeTabId: 'tab-a',
      generation: 1,
    })

    expect(loadEditorWorkspace(database)).toMatchObject({
      workspaceId: 'default',
      activeTabId: 'tab-a',
      generation: 1,
      legacyStorageVersion: 0,
      tabs: [{ id: 'tab-a', content: 'print("a")', status: 'open' }],
      recentlyClosedTabs: [],
    })
  })

  it('persists tab kinds and canonicalizes exercise saves to topology-only content', () => {
    expect(saveEditorTab(database, tab())).toMatchObject({
      status: 'saved',
      tab: { id: 'tab-a', kind: 'file' },
    })
    expect(
      saveEditorTab(
        database,
        tab({
          id: 'problem-a',
          mutationId: 'mutation-problem-a',
          kind: 'problem',
          problemId: 'problem-a',
          position: 1,
        }),
      ),
    ).toMatchObject({ status: 'saved', tab: { id: 'problem-a', kind: 'problem' } })
    const exerciseInput = tab({
      id: 'exercise-a',
      mutationId: 'mutation-exercise-a',
      kind: 'exercise',
      problemId: 'exercise-a',
      position: 2,
    })
    expect(saveEditorTab(database, exerciseInput)).toMatchObject({
      status: 'saved',
      applied: true,
      tab: { id: 'exercise-a', kind: 'exercise', content: '' },
    })
    expect(
      saveEditorTab(database, { ...exerciseInput, content: 'ignored retry payload' }),
    ).toMatchObject({
      status: 'saved',
      applied: false,
      tab: { id: 'exercise-a', content: '' },
    })

    expect(loadEditorWorkspace(database).tabs.map((item) => [item.id, item.kind])).toEqual([
      ['tab-a', 'file'],
      ['problem-a', 'problem'],
      ['exercise-a', 'exercise'],
    ])
    expect(
      loadEditorWorkspace(database).tabs.find((item) => item.id === 'exercise-a')?.content,
    ).toBe('')
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
      generation: 1,
    })
    expect(setActiveEditorTab(database, 'default', 'tab-a').generation).toBe(1)
    expect(setActiveEditorTab(database, 'default', 'missing')).toEqual({
      activeTabId: null,
      generation: 1,
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
      tabs: [{ id: 'tab-open', kind: 'file', revision: 2, status: 'open' }],
      recentlyClosedTabs: [{ id: 'tab-closed', kind: 'file', revision: 3, status: 'closed' }],
    })
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'editor_workspace_state'",
        )
        .get(),
    ).toBeUndefined()
    expect(
      database
        .prepare("SELECT version FROM schema_migrations WHERE component = 'editor-workspace'")
        .get(),
    ).toEqual({ version: EDITOR_WORKSPACE_SCHEMA_VERSION })
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

  it('adds tab kind to the previous versioned schema without losing data', () => {
    database.close()
    database = new Database(':memory:')
    database.exec(`
      CREATE TABLE editor_workspaces (
        workspace_id TEXT PRIMARY KEY,
        last_active_tab_id TEXT,
        generation INTEGER NOT NULL DEFAULT 0,
        legacy_storage_version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT
      );
      CREATE TABLE editor_tabs (
        workspace_id TEXT NOT NULL,
        tab_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        language TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        problem_id TEXT,
        cursor_line INTEGER,
        cursor_column INTEGER,
        scroll_top REAL NOT NULL DEFAULT 0,
        tab_position INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        revision INTEGER NOT NULL DEFAULT 1,
        last_mutation_id TEXT,
        last_mutation_kind TEXT,
        last_mutation_fingerprint TEXT,
        client_id TEXT,
        last_view_mutation_id TEXT,
        last_view_mutation_fingerprint TEXT,
        view_client_id TEXT,
        created_at TEXT,
        updated_at TEXT,
        view_updated_at TEXT,
        closed_at TEXT,
        deleted_at TEXT,
        PRIMARY KEY (workspace_id, tab_id)
      );
      INSERT INTO editor_workspaces (workspace_id, last_active_tab_id)
      VALUES ('default', 'old-tab');
      INSERT INTO editor_tabs (
        workspace_id, tab_id, filename, language, content, status, revision,
        created_at, updated_at, view_updated_at
      ) VALUES (
        'default', 'old-tab', 'old.py', 'python', 'preserved', 'open', 4,
        '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
      );
    `)

    ensureEditorWorkspaceSchema(database)

    expect(
      database.prepare("SELECT tab_kind FROM editor_tabs WHERE tab_id = 'old-tab'").get(),
    ).toEqual({ tab_kind: 'file' })
    expect(loadEditorWorkspace(database)).toMatchObject({
      activeTabId: 'old-tab',
      tabs: [{ id: 'old-tab', kind: 'file', content: 'preserved', revision: 4 }],
    })
  })

  it('atomically imports the versioned local workspace only once', () => {
    const input = {
      workspaceId: 'default',
      mutationId: 'legacy-migration-1',
      clientId: 'client-a',
      storageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
      activeTabId: 'local-b',
      tabs: [
        {
          id: 'local-a',
          filename: 'a.py',
          language: 'python',
          content: 'print("a")',
          kind: 'file' as const,
          problemId: null,
          cursorPosition: { lineNumber: 3, column: 2 },
          scrollTop: 24,
          position: 0,
          status: 'open' as const,
        },
        {
          id: 'local-b',
          filename: 'b.js',
          language: 'javascript',
          content: 'console.log("b")',
          kind: 'problem' as const,
          problemId: 'problem-b',
          cursorPosition: null,
          scrollTop: 0,
          position: 1,
          status: 'open' as const,
        },
        {
          id: 'local-closed',
          filename: 'closed.py',
          language: 'python',
          content: 'closed content',
          kind: 'exercise' as const,
          problemId: null,
          cursorPosition: null,
          scrollTop: 0,
          position: 0,
          status: 'closed' as const,
        },
      ],
    }

    const migrated = migrateLegacyEditorWorkspace(database, input)
    expect(migrated).toMatchObject({
      status: 'migrated',
      workspace: {
        activeTabId: 'local-b',
        legacyStorageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
        tabs: [
          {
            id: 'local-a',
            kind: 'file',
            cursorPosition: { lineNumber: 3, column: 2 },
            scrollTop: 24,
          },
          { id: 'local-b', kind: 'problem', problemId: 'problem-b' },
        ],
      },
    })
    const exerciseInput = input.tabs[2]
    const exerciseRecoveryId = legacyExerciseRecoveryTabId(exerciseInput)
    expect(migrated.workspace.recentlyClosedTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'local-closed', kind: 'exercise', content: '' }),
        expect.objectContaining({
          id: exerciseRecoveryId,
          kind: 'file',
          content: 'closed content',
        }),
      ]),
    )
    expect(migrated.recoveredTabIds).toContain(exerciseRecoveryId)

    expect(
      migrateLegacyEditorWorkspace(database, { ...input, mutationId: 'legacy-migration-2' }),
    ).toMatchObject({ status: 'already-migrated', workspace: { tabs: [{}, {}] } })
    expect(loadEditorWorkspace(database).tabs).toHaveLength(2)
  })

  it('preserves an id conflict as a deterministic recovered copy', () => {
    saveEditorTab(database, tab({ content: 'new database content' }))

    const result = migrateLegacyEditorWorkspace(database, {
      workspaceId: 'default',
      mutationId: 'legacy-conflict',
      clientId: 'client-a',
      storageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
      activeTabId: 'tab-a',
      tabs: [
        {
          id: 'tab-a',
          filename: 'a.py',
          language: 'python',
          content: 'valuable local content',
          problemId: null,
          cursorPosition: null,
          scrollTop: 0,
          position: 0,
          status: 'open',
        },
      ],
    })

    expect(result.recoveredTabIds).toHaveLength(1)
    expect(result.workspace.tabs.map((item) => item.content)).toEqual([
      'new database content',
      'valuable local content',
    ])
    expect(result.workspace.tabs[1].filename).toContain('.recovered.')
  })

  it('preserves a legacy closed tab when SQLite has the same content open', () => {
    saveEditorTab(database, tab({ content: 'same content' }))

    const result = migrateLegacyEditorWorkspace(database, {
      workspaceId: 'default',
      mutationId: 'legacy-status-conflict',
      clientId: 'client-a',
      storageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
      activeTabId: null,
      tabs: [
        {
          id: 'tab-a',
          filename: 'a.py',
          language: 'python',
          content: 'same content',
          kind: 'file',
          problemId: null,
          cursorPosition: null,
          scrollTop: 0,
          position: 0,
          status: 'closed',
        },
      ],
    })

    expect(result.recoveredTabMappings['tab-a']).toMatch(/^recovered-tab-a-/)
    expect(result.workspace.tabs).toEqual([
      expect.objectContaining({ id: 'tab-a', status: 'open' }),
    ])
    expect(result.workspace.recentlyClosedTabs).toEqual([
      expect.objectContaining({
        id: result.recoveredTabMappings['tab-a'],
        content: 'same content',
        status: 'closed',
      }),
    ])
  })

  it('upgrades v3 embedded content for exercise and exercise-* problem tabs transactionally', () => {
    database.exec(`
      INSERT INTO editor_workspaces (
        workspace_id, last_active_tab_id, generation, legacy_storage_version
      ) VALUES ('default', 'exercise-imported-open', 7, 3);
      INSERT INTO editor_tabs (
        workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
        tab_position, status, revision
      ) VALUES
        ('default', 'exercise-imported-open', 'open.py', 'python', 'open legacy code',
         'problem', 'problem-open', 0, 'open', 4),
        ('default', 'legacy-closed', 'closed.js', 'javascript', 'closed legacy code',
         'exercise', 'exercise-closed', 0, 'closed', 2);
    `)
    const openRecoveryId = legacyExerciseRecoveryTabId({
      id: 'exercise-imported-open',
      filename: 'open.py',
      language: 'python',
      content: 'open legacy code',
      problemId: 'problem-open',
    })
    const closedRecoveryId = legacyExerciseRecoveryTabId({
      id: 'legacy-closed',
      filename: 'closed.js',
      language: 'javascript',
      content: 'closed legacy code',
      problemId: 'exercise-closed',
    })
    const input = {
      workspaceId: 'default',
      mutationId: 'upgrade-exercise-v3',
      clientId: 'client-upgrade',
      storageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
      activeTabId: null,
      tabs: [],
    }

    const upgraded = migrateLegacyEditorWorkspace(database, input)

    expect(upgraded).toMatchObject({
      status: 'migrated',
      workspace: {
        activeTabId: 'exercise-imported-open',
        generation: 8,
        legacyStorageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
      },
    })
    expect(upgraded.recoveredTabIds).toEqual(
      expect.arrayContaining([openRecoveryId, closedRecoveryId]),
    )
    expect(upgraded.workspace.tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'exercise-imported-open',
          kind: 'problem',
          content: '',
          revision: 5,
        }),
        expect.objectContaining({ id: openRecoveryId, kind: 'file', content: 'open legacy code' }),
      ]),
    )
    expect(upgraded.workspace.recentlyClosedTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-closed',
          kind: 'exercise',
          content: '',
          revision: 3,
        }),
        expect.objectContaining({
          id: closedRecoveryId,
          kind: 'file',
          content: 'closed legacy code',
        }),
      ]),
    )

    const rowCountBeforeRetry = (
      database.prepare('SELECT COUNT(*) AS count FROM editor_tabs').get() as { count: number }
    ).count
    expect(
      migrateLegacyEditorWorkspace(database, { ...input, mutationId: 'upgrade-exercise-v3-retry' }),
    ).toMatchObject({
      status: 'already-migrated',
      workspace: { generation: 8, legacyStorageVersion: EDITOR_WORKSPACE_STORAGE_VERSION },
      recoveredTabIds: [],
    })
    expect(
      (database.prepare('SELECT COUNT(*) AS count FROM editor_tabs').get() as { count: number })
        .count,
    ).toBe(rowCountBeforeRetry)
  })

  it('rolls back recovery creation and exercise clearing when the v3 upgrade fails', () => {
    database.exec(`
      INSERT INTO editor_workspaces (workspace_id, generation, legacy_storage_version)
      VALUES ('default', 3, 3);
      INSERT INTO editor_tabs (
        workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
        tab_position, status, revision
      ) VALUES (
        'default', 'exercise-rollback', 'legacy.py', 'python', 'must survive rollback',
        'problem', 'problem-rollback', 0, 'open', 6
      );
      CREATE TRIGGER reject_exercise_recovery
      BEFORE INSERT ON editor_tabs
      WHEN NEW.tab_id LIKE 'recovered-exercise-%'
      BEGIN
        SELECT RAISE(ABORT, 'forced recovery failure');
      END;
    `)

    expect(() =>
      migrateLegacyEditorWorkspace(database, {
        workspaceId: 'default',
        mutationId: 'upgrade-exercise-rollback',
        clientId: 'client-upgrade',
        storageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
        activeTabId: null,
        tabs: [],
      }),
    ).toThrow('forced recovery failure')

    expect(
      database
        .prepare(
          `SELECT content, revision FROM editor_tabs
           WHERE workspace_id = 'default' AND tab_id = 'exercise-rollback'`,
        )
        .get(),
    ).toEqual({ content: 'must survive rollback', revision: 6 })
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM editor_tabs WHERE tab_id LIKE 'recovered-exercise-%'",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(loadEditorWorkspace(database)).toMatchObject({
      generation: 3,
      legacyStorageVersion: 3,
      tabs: [{ id: 'exercise-rollback', kind: 'problem', content: 'must survive rollback' }],
    })
  })

  it('rolls back every imported tab and the version marker when migration fails', () => {
    expect(() =>
      migrateLegacyEditorWorkspace(database, {
        workspaceId: 'default',
        mutationId: 'legacy-failure',
        clientId: 'client-a',
        storageVersion: EDITOR_WORKSPACE_STORAGE_VERSION,
        activeTabId: 'valid-first',
        tabs: [
          {
            id: 'valid-first',
            filename: 'valid.py',
            language: 'python',
            content: 'valid',
            problemId: null,
            cursorPosition: null,
            scrollTop: 0,
            position: 0,
            status: 'open',
          },
          {
            id: 'invalid-second',
            filename: 'invalid.py',
            language: 'python',
            content: 'invalid',
            problemId: null,
            cursorPosition: null,
            scrollTop: -1,
            position: 1,
            status: 'open',
          },
        ],
      }),
    ).toThrow()

    expect(loadEditorWorkspace(database)).toMatchObject({
      tabs: [],
      legacyStorageVersion: 0,
    })
  })
})
