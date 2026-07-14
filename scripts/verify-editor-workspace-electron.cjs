/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const Database = require('better-sqlite3')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')

function loadTypeScriptModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(output, filename)
  return loaded.exports
}

function saveInput(overrides = {}) {
  return {
    workspaceId: 'default',
    id: 'tab-a',
    mutationId: 'save-a-1',
    clientId: 'client-a',
    filename: 'a.py',
    language: 'python',
    content: 'print("a")',
    problemId: null,
    position: 0,
    baseRevision: 0,
    ...overrides,
  }
}

function run() {
  const repository = loadTypeScriptModule(
    path.join(__dirname, '..', 'electron', 'db', 'editorWorkspaceRepository.ts'),
  )
  const database = new Database(':memory:')
  try {
    const created = repository.saveEditorTab(database, saveInput())
    assert.equal(created.status, 'saved')
    assert.equal(created.applied, true)
    assert.equal(created.tab.revision, 1)
    assert.equal(created.tab.kind, 'file')

    repository.saveEditorTab(
      database,
      saveInput({
        workspaceId: 'secondary',
        mutationId: 'secondary-save-a-1',
      }),
    )
    assert.equal(repository.loadEditorWorkspace(database, 'default').tabs.length, 1)
    assert.equal(repository.loadEditorWorkspace(database, 'secondary').tabs.length, 1)

    const updatedInput = saveInput({
      mutationId: 'save-a-2',
      content: 'updated',
      baseRevision: 1,
    })
    assert.equal(repository.saveEditorTab(database, updatedInput).tab.revision, 2)
    const retried = repository.saveEditorTab(database, updatedInput)
    assert.equal(retried.status, 'saved')
    assert.equal(retried.applied, false)
    assert.equal(
      repository.saveEditorTab(database, {
        ...updatedInput,
        content: 'different retry payload',
      }).status,
      'conflict',
    )
    assert.equal(
      repository.saveEditorTab(
        database,
        saveInput({ mutationId: 'stale-save', content: 'stale', baseRevision: 1 }),
      ).status,
      'conflict',
    )

    const viewInput = {
      workspaceId: 'default',
      id: 'tab-a',
      mutationId: 'view-a-1',
      clientId: 'client-a',
      cursorPosition: { lineNumber: 1, column: 4 },
      scrollTop: 32,
    }
    const viewSaved = repository.updateEditorTabViewState(database, viewInput)
    assert.equal(viewSaved.viewState.revision, 2)
    assert.equal(Object.hasOwn(viewSaved.viewState, 'content'), false)
    assert.equal(repository.updateEditorTabViewState(database, viewInput).applied, false)
    assert.equal(
      repository.updateEditorTabViewState(database, { ...viewInput, scrollTop: 33 }).status,
      'conflict',
    )

    repository.saveEditorTab(
      database,
      saveInput({
        id: 'tab-b',
        mutationId: 'save-b-1',
        filename: 'b.py',
        kind: 'problem',
        problemId: 'problem-b',
        position: 5,
      }),
    )
    assert.equal(repository.loadEditorWorkspace(database).tabs[1].kind, 'problem')
    const closed = repository.closeEditorTab(database, {
      workspaceId: 'default',
      id: 'tab-a',
      mutationId: 'close-a-1',
      clientId: 'client-a',
      baseRevision: 2,
    })
    assert.equal(closed.tab.status, 'closed')
    assert.equal(repository.loadEditorWorkspace(database).recentlyClosedTabs.length, 1)

    const reopened = repository.reopenEditorTab(database, {
      workspaceId: 'default',
      id: 'tab-a',
      mutationId: 'reopen-a-1',
      clientId: 'client-a',
      baseRevision: 3,
    })
    assert.equal(reopened.tab.position, 6)
    const reclosed = repository.closeEditorTab(database, {
      workspaceId: 'default',
      id: 'tab-a',
      mutationId: 'close-a-2',
      clientId: 'client-a',
      baseRevision: 4,
    })
    const deleted = repository.deleteEditorTab(database, {
      workspaceId: 'default',
      id: 'tab-a',
      mutationId: 'delete-a-1',
      clientId: 'client-a',
      baseRevision: reclosed.tab.revision,
    })
    assert.equal(deleted.tab.status, 'deleted')
    assert.equal(
      repository.reopenEditorTab(database, {
        workspaceId: 'default',
        id: 'tab-a',
        mutationId: 'reopen-deleted-a',
        clientId: 'client-b',
        baseRevision: deleted.tab.revision,
      }).status,
      'conflict',
    )
  } finally {
    database.close()
  }

  const legacy = new Database(':memory:')
  try {
    legacy.exec(`
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
      INSERT INTO editor_tabs
        (tab_id, filename, language, content, tab_position, revision, deleted)
      VALUES ('legacy', 'legacy.py', 'python', 'legacy', 0, 3, 1);
    `)
    legacy.exec(fs.readFileSync(path.join(__dirname, '..', 'electron', 'db', 'schema.sql'), 'utf8'))
    repository.ensureEditorWorkspaceSchema(legacy)
    const migrated = repository.loadEditorWorkspace(legacy)
    assert.equal(migrated.recentlyClosedTabs[0].id, 'legacy')
    assert.equal(migrated.recentlyClosedTabs[0].revision, 3)
    assert.equal(migrated.recentlyClosedTabs[0].status, 'closed')
    assert.equal(migrated.recentlyClosedTabs[0].kind, 'file')
  } finally {
    legacy.close()
  }

  const previousVersioned = new Database(':memory:')
  try {
    previousVersioned.exec(`
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
    repository.ensureEditorWorkspaceSchema(previousVersioned)
    const upgraded = repository.loadEditorWorkspace(previousVersioned)
    assert.equal(upgraded.tabs[0].content, 'preserved')
    assert.equal(upgraded.tabs[0].kind, 'file')
  } finally {
    previousVersioned.close()
  }

  const invalidMigration = new Database(':memory:')
  try {
    assert.throws(() =>
      repository.migrateLegacyEditorWorkspace(invalidMigration, {
        workspaceId: 'default',
        mutationId: 'invalid-legacy-migration',
        clientId: 'electron-verifier',
        storageVersion: 2,
        activeTabId: 'invalid-tab',
        tabs: [
          {
            id: 'invalid-tab',
            filename: 'invalid.py',
            language: 'python',
            content: 'valuable content must not be skipped',
            problemId: null,
            cursorPosition: null,
            scrollTop: -1,
            position: 0,
            status: 'open',
          },
        ],
      }),
    )
    const afterFailure = repository.loadEditorWorkspace(invalidMigration)
    assert.equal(afterFailure.tabs.length, 0)
    assert.equal(afterFailure.legacyStorageVersion, 0)
  } finally {
    invalidMigration.close()
  }

  const statusConflictMigration = new Database(':memory:')
  try {
    repository.saveEditorTab(
      statusConflictMigration,
      saveInput({ content: 'same content before migration' }),
    )
    const result = repository.migrateLegacyEditorWorkspace(statusConflictMigration, {
      workspaceId: 'default',
      mutationId: 'legacy-status-conflict',
      clientId: 'electron-verifier',
      storageVersion: 2,
      activeTabId: null,
      tabs: [
        {
          id: 'tab-a',
          filename: 'a.py',
          language: 'python',
          content: 'same content before migration',
          kind: 'file',
          problemId: null,
          cursorPosition: null,
          scrollTop: 0,
          position: 0,
          status: 'closed',
        },
      ],
    })
    const recoveredId = result.recoveredTabMappings['tab-a']
    assert.match(recoveredId, /^recovered-tab-a-/)
    assert.equal(result.workspace.tabs[0].id, 'tab-a')
    assert.equal(result.workspace.recentlyClosedTabs[0].id, recoveredId)
    assert.equal(result.workspace.recentlyClosedTabs[0].status, 'closed')
  } finally {
    statusConflictMigration.close()
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codehelper-editor-workspace-'))
  const databasePath = path.join(directory, 'codehelper.db')
  try {
    const first = new Database(databasePath)
    const migrated = repository.migrateLegacyEditorWorkspace(first, {
      workspaceId: 'default',
      mutationId: 'legacy-file-migration',
      clientId: 'electron-verifier',
      storageVersion: 2,
      activeTabId: 'persisted-local',
      tabs: [
        {
          id: 'persisted-local',
          filename: 'persisted.py',
          language: 'python',
          content: 'print("persisted")',
          kind: 'exercise',
          problemId: null,
          cursorPosition: { lineNumber: 2, column: 4 },
          scrollTop: 48,
          position: 0,
          status: 'open',
        },
      ],
    })
    assert.equal(migrated.status, 'migrated')
    assert.equal(migrated.workspace.legacyStorageVersion, 2)
    first.close()

    const reopened = new Database(databasePath)
    const restored = repository.loadEditorWorkspace(reopened)
    assert.equal(restored.activeTabId, 'persisted-local')
    assert.equal(restored.tabs[0].content, 'print("persisted")')
    assert.equal(restored.tabs[0].kind, 'exercise')
    assert.equal(restored.tabs[0].cursorPosition.lineNumber, 2)
    assert.equal(restored.tabs[0].scrollTop, 48)
    assert.equal(
      repository.migrateLegacyEditorWorkspace(reopened, {
        workspaceId: 'default',
        mutationId: 'legacy-file-migration-retry',
        clientId: 'electron-verifier',
        storageVersion: 2,
        activeTabId: null,
        tabs: [],
      }).status,
      'already-migrated',
    )
    reopened.close()
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

try {
  run()
  console.log('EDITOR_WORKSPACE_ELECTRON_OK')
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
