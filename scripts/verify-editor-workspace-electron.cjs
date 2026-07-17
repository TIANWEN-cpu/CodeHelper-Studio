/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const Database = require('better-sqlite3')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')

function loadTypeScriptModule(filename) {
  const compile = (loaded, sourceFilename) => {
    const source = fs.readFileSync(sourceFilename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourceFilename,
    }).outputText
    loaded._compile(output, sourceFilename)
  }
  const previousLoader = Module._extensions['.ts']
  Module._extensions['.ts'] = compile
  try {
    const loaded = new Module(filename, module)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    compile(loaded, filename)
    return loaded.exports
  } finally {
    if (previousLoader) Module._extensions['.ts'] = previousLoader
    else delete Module._extensions['.ts']
  }
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
  const workspaceContract = loadTypeScriptModule(
    path.join(__dirname, '..', 'src', 'shared', 'editorWorkspaceContract.ts'),
  )
  const schemaVersion = repository.EDITOR_WORKSPACE_SCHEMA_VERSION
  const storageVersion = repository.EDITOR_WORKSPACE_STORAGE_VERSION
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
        storageVersion,
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
      storageVersion,
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

  const storageV3 = new Database(':memory:')
  try {
    repository.ensureEditorWorkspaceSchema(storageV3)
    storageV3.exec(`
      INSERT INTO editor_workspaces (
        workspace_id, last_active_tab_id, generation, legacy_storage_version
      ) VALUES ('default', 'exercise-imported-problem', 4, 3);
      INSERT INTO editor_tabs (
        workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
        cursor_line, cursor_column, scroll_top, tab_position, status, revision
      ) VALUES (
        'default', 'exercise-imported-problem', 'imported.py', 'python',
        'print("legacy imported problem")', 'problem', 'problem-imported',
        7, 3, 96, 0, 'open', 5
      );
    `)
    const expectedRecoveryId = workspaceContract.legacyExerciseRecoveryTabId({
      id: 'exercise-imported-problem',
      filename: 'imported.py',
      language: 'python',
      content: 'print("legacy imported problem")',
      problemId: 'problem-imported',
    })
    const upgraded = repository.migrateLegacyEditorWorkspace(storageV3, {
      workspaceId: 'default',
      mutationId: 'upgrade-storage-v3',
      clientId: 'electron-verifier',
      storageVersion,
      activeTabId: null,
      tabs: [],
    })
    const upgradedOriginal = upgraded.workspace.tabs.find(
      (tab) => tab.id === 'exercise-imported-problem',
    )
    const upgradedRecovery = upgraded.workspace.tabs.find((tab) => tab.id === expectedRecoveryId)
    assert.deepEqual(upgraded.recoveredTabIds, [expectedRecoveryId])
    assert.equal(upgradedOriginal.kind, 'problem')
    assert.equal(upgradedOriginal.content, '')
    assert.equal(upgradedOriginal.revision, 6)
    assert.equal(upgradedOriginal.cursorPosition.lineNumber, 7)
    assert.equal(upgradedOriginal.scrollTop, 96)
    assert.equal(upgradedRecovery.kind, 'file')
    assert.equal(upgradedRecovery.content, 'print("legacy imported problem")')
    assert.equal(upgradedRecovery.cursorPosition.lineNumber, 7)
    assert.equal(upgradedRecovery.scrollTop, 96)
    assert.equal(upgraded.workspace.legacyStorageVersion, storageVersion)
    const tabCount = storageV3.prepare('SELECT COUNT(*) AS count FROM editor_tabs').get().count
    assert.equal(
      repository.migrateLegacyEditorWorkspace(storageV3, {
        workspaceId: 'default',
        mutationId: 'upgrade-storage-v3-retry',
        clientId: 'electron-verifier',
        storageVersion,
        activeTabId: null,
        tabs: [],
      }).status,
      'already-migrated',
    )
    assert.equal(
      storageV3.prepare('SELECT COUNT(*) AS count FROM editor_tabs').get().count,
      tabCount,
    )
  } finally {
    storageV3.close()
  }

  const failedStorageV3 = new Database(':memory:')
  try {
    repository.ensureEditorWorkspaceSchema(failedStorageV3)
    failedStorageV3.exec(`
      INSERT INTO editor_workspaces (workspace_id, generation, legacy_storage_version)
      VALUES ('default', 2, 3);
      INSERT INTO editor_tabs (
        workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
        tab_position, status, revision
      ) VALUES (
        'default', 'exercise-rollback', 'rollback.py', 'python', 'preserve me',
        'problem', 'problem-rollback', 0, 'open', 9
      );
      CREATE TRIGGER reject_exercise_recovery
      BEFORE INSERT ON editor_tabs
      WHEN NEW.tab_id LIKE 'recovered-exercise-%'
      BEGIN
        SELECT RAISE(ABORT, 'forced recovery failure');
      END;
    `)
    assert.throws(
      () =>
        repository.migrateLegacyEditorWorkspace(failedStorageV3, {
          workspaceId: 'default',
          mutationId: 'upgrade-storage-v3-failure',
          clientId: 'electron-verifier',
          storageVersion,
          activeTabId: null,
          tabs: [],
        }),
      /forced recovery failure/,
    )
    assert.deepEqual(
      failedStorageV3
        .prepare(
          `SELECT content, tab_kind, revision FROM editor_tabs
           WHERE workspace_id = 'default' AND tab_id = 'exercise-rollback'`,
        )
        .get(),
      { content: 'preserve me', tab_kind: 'problem', revision: 9 },
    )
    assert.deepEqual(
      failedStorageV3
        .prepare(
          "SELECT legacy_storage_version FROM editor_workspaces WHERE workspace_id = 'default'",
        )
        .get(),
      { legacy_storage_version: 3 },
    )
    assert.equal(
      failedStorageV3
        .prepare(
          "SELECT COUNT(*) AS count FROM editor_tabs WHERE tab_id LIKE 'recovered-exercise-%'",
        )
        .get().count,
      0,
    )
  } finally {
    failedStorageV3.close()
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codehelper-editor-workspace-'))
  const databasePath = path.join(directory, 'codehelper.db')
  try {
    const first = new Database(databasePath)
    const migrated = repository.migrateLegacyEditorWorkspace(first, {
      workspaceId: 'default',
      mutationId: 'legacy-file-migration',
      clientId: 'electron-verifier',
      storageVersion,
      activeTabId: 'persisted-exercise',
      tabs: [
        {
          id: 'persisted-file',
          filename: 'persisted-file.py',
          language: 'python',
          content: 'print("persisted file")',
          kind: 'file',
          problemId: null,
          cursorPosition: { lineNumber: 1, column: 8 },
          scrollTop: 12,
          position: 0,
          status: 'open',
        },
        {
          id: 'persisted-problem',
          filename: 'persisted-problem.js',
          language: 'javascript',
          content: 'return "persisted problem"',
          kind: 'problem',
          problemId: 'problem-persisted',
          cursorPosition: { lineNumber: 3, column: 5 },
          scrollTop: 24,
          position: 7,
          status: 'closed',
        },
        {
          id: 'persisted-exercise',
          filename: 'persisted-exercise.py',
          language: 'python',
          content: 'print("persisted exercise")',
          kind: 'exercise',
          problemId: 'exercise-persisted',
          cursorPosition: { lineNumber: 2, column: 4 },
          scrollTop: 48,
          position: 2,
          status: 'open',
        },
      ],
    })
    assert.equal(migrated.status, 'migrated')
    assert.equal(migrated.workspace.legacyStorageVersion, storageVersion)
    const migratedRecoveryId = migrated.recoveredTabIds.find((id) =>
      id.startsWith('recovered-exercise-'),
    )
    assert.ok(migratedRecoveryId)
    assert.deepEqual(
      first
        .prepare("SELECT version FROM schema_migrations WHERE component = 'editor-workspace'")
        .get(),
      { version: schemaVersion },
    )
    first.close()

    const reopened = new Database(databasePath)
    const restored = repository.loadEditorWorkspace(reopened)
    const restoredFile = restored.tabs.find((tab) => tab.id === 'persisted-file')
    const restoredExercise = restored.tabs.find((tab) => tab.id === 'persisted-exercise')
    const restoredRecovery = restored.tabs.find((tab) => tab.id === migratedRecoveryId)
    const restoredProblem = restored.recentlyClosedTabs.find(
      (tab) => tab.id === 'persisted-problem',
    )
    assert.equal(restored.activeTabId, 'persisted-exercise')
    assert.deepEqual(
      restored.tabs.map((tab) => tab.id),
      ['persisted-file', 'persisted-exercise', migratedRecoveryId],
    )
    assert.equal(restoredFile.kind, 'file')
    assert.equal(restoredFile.status, 'open')
    assert.equal(restoredFile.content, 'print("persisted file")')
    assert.equal(restoredFile.position, 0)
    assert.equal(restoredExercise.content, '')
    assert.equal(restoredExercise.kind, 'exercise')
    assert.equal(restoredExercise.status, 'open')
    assert.equal(restoredExercise.position, 1)
    assert.equal(restoredExercise.cursorPosition.lineNumber, 2)
    assert.equal(restoredExercise.scrollTop, 48)
    assert.equal(restoredRecovery.kind, 'file')
    assert.equal(restoredRecovery.status, 'open')
    assert.equal(restoredRecovery.content, 'print("persisted exercise")')
    assert.equal(restoredRecovery.position, 2)
    assert.equal(restoredProblem.kind, 'problem')
    assert.equal(restoredProblem.problemId, 'problem-persisted')
    assert.equal(restoredProblem.status, 'closed')
    assert.equal(restoredProblem.content, 'return "persisted problem"')
    assert.equal(restoredProblem.position, 7)
    assert.deepEqual(
      reopened
        .prepare("SELECT version FROM schema_migrations WHERE component = 'editor-workspace'")
        .get(),
      { version: schemaVersion },
    )
    assert.equal(
      repository.migrateLegacyEditorWorkspace(reopened, {
        workspaceId: 'default',
        mutationId: 'legacy-file-migration-retry',
        clientId: 'electron-verifier',
        storageVersion,
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
