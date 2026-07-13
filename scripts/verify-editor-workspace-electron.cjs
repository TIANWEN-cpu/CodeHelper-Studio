/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const Database = require('better-sqlite3')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
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
        position: 5,
      }),
    )
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
  } finally {
    legacy.close()
  }
}

try {
  run()
  console.log('EDITOR_WORKSPACE_ELECTRON_OK')
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
