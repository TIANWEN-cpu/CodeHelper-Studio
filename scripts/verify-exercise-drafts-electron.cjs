/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { app } = require('electron')
const Database = require('better-sqlite3')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')
const {
  createIsolatedElectronUserData,
  finishIsolatedElectronTest,
} = require('./electron-test-user-data.cjs')

const isolatedUserData = createIsolatedElectronUserData(app, 'codehelper-draft-electron-user-data-')

app.disableHardwareAcceleration()

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

function run() {
  const repository = loadTypeScriptModule(
    path.join(__dirname, '..', 'electron', 'db', 'exerciseDraftRepository.ts'),
  )

  const legacy = new Database(':memory:')
  legacy.exec(`
    CREATE TABLE exercise_drafts (
      exercise_id TEXT PRIMARY KEY,
      title TEXT,
      code TEXT,
      updated_at TEXT
    );
    INSERT INTO exercise_drafts (exercise_id, title, code, updated_at)
    VALUES ('legacy', 'Legacy', 'print(1)', NULL);
  `)
  repository.ensureExerciseDraftSchema(legacy)
  assert.deepEqual(
    {
      ...repository.getExerciseDraft(legacy, 'legacy'),
      updatedAt: '<normalized>',
    },
    {
      exerciseId: 'legacy',
      title: 'Legacy',
      code: 'print(1)',
      language: null,
      revision: 1,
      updatedAt: '<normalized>',
      deleted: false,
    },
  )
  const migratedEdit = repository.saveExerciseDraft(legacy, {
    exerciseId: 'legacy',
    code: 'print(2)',
    language: 'python',
    baseRevision: 1,
  })
  assert.equal(migratedEdit.status, 'saved')
  assert.equal(migratedEdit.draft.title, 'Legacy')
  assert.equal(migratedEdit.draft.revision, 2)
  const migratedEditRetry = repository.saveExerciseDraft(legacy, {
    exerciseId: 'legacy',
    code: 'print(2)',
    language: 'python',
    baseRevision: 1,
  })
  assert.equal(migratedEditRetry.status, 'saved')
  assert.equal(migratedEditRetry.draft.title, 'Legacy')
  assert.equal(migratedEditRetry.draft.revision, 2)
  const explicitTitleClear = repository.saveExerciseDraft(legacy, {
    exerciseId: 'legacy',
    title: null,
    code: 'print(3)',
    language: 'python',
    baseRevision: 2,
  })
  assert.equal(explicitTitleClear.status, 'saved')
  assert.equal(explicitTitleClear.draft.title, null)
  const explicitTitleClearRetry = repository.saveExerciseDraft(legacy, {
    exerciseId: 'legacy',
    title: null,
    code: 'print(3)',
    language: 'python',
    baseRevision: 2,
  })
  assert.equal(explicitTitleClearRetry.status, 'saved')
  assert.equal(explicitTitleClearRetry.draft.revision, 3)
  legacy.close()

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codehelper-draft-electron-'))
  const databasePath = path.join(directory, 'codehelper.db')
  try {
    const first = new Database(databasePath)
    assert.equal(
      repository.saveExerciseDraft(first, {
        exerciseId: 'exercise-a',
        title: 'Exercise A',
        code: 'console.log(1)',
        language: 'javascript',
        baseRevision: 0,
      }).status,
      'saved',
    )
    first.close()

    const reopened = new Database(databasePath)
    assert.deepEqual(
      {
        ...repository.getExerciseDraft(reopened, 'exercise-a'),
        updatedAt: '<normalized>',
      },
      {
        exerciseId: 'exercise-a',
        title: 'Exercise A',
        code: 'console.log(1)',
        language: 'javascript',
        revision: 1,
        updatedAt: '<normalized>',
        deleted: false,
      },
    )

    const firstWriter = repository.saveExerciseDraft(reopened, {
      exerciseId: 'exercise-a',
      code: 'writer one',
      language: 'javascript',
      baseRevision: 1,
    })
    const staleWriter = repository.saveExerciseDraft(reopened, {
      exerciseId: 'exercise-a',
      code: 'writer two stale',
      language: 'javascript',
      baseRevision: 1,
    })
    assert.equal(firstWriter.status, 'saved')
    assert.equal(staleWriter.status, 'conflict')
    assert.equal(repository.getExerciseDraft(reopened, 'exercise-a').code, 'writer one')
    assert.equal(repository.getExerciseDraft(reopened, 'exercise-a').title, 'Exercise A')

    const cleared = repository.clearExerciseDraft(reopened, 'exercise-a', 2)
    assert.equal(cleared.status, 'saved')
    assert.equal(cleared.draft.deleted, true)
    assert.equal(cleared.draft.revision, 3)
    assert.equal(cleared.draft.title, 'Exercise A')

    const resurrect = repository.saveExerciseDraft(reopened, {
      exerciseId: 'exercise-a',
      code: 'old window',
      language: 'javascript',
      baseRevision: 2,
    })
    assert.equal(resurrect.status, 'conflict')
    assert.equal(resurrect.current.deleted, true)

    const invalidCreate = repository.saveExerciseDraft(reopened, {
      exerciseId: 'missing',
      code: 'stale',
      language: 'python',
      baseRevision: 9,
    })
    assert.deepEqual(invalidCreate, { status: 'conflict', current: null })

    const clearedMissing = repository.clearExerciseDraft(reopened, 'cleared-before-save', 0)
    assert.equal(clearedMissing.status, 'saved')
    assert.equal(clearedMissing.draft.revision, 1)
    assert.equal(clearedMissing.draft.deleted, true)
    const staleAfterClear = repository.saveExerciseDraft(reopened, {
      exerciseId: 'cleared-before-save',
      code: 'stale initial window',
      language: 'python',
      baseRevision: 0,
    })
    assert.equal(staleAfterClear.status, 'conflict')

    const repeatedClear = repository.clearExerciseDraft(reopened, 'cleared-before-save', 0)
    assert.equal(repeatedClear.status, 'saved')
    assert.equal(repeatedClear.draft.revision, 1)
    const restoredAfterClear = repository.saveExerciseDraft(reopened, {
      exerciseId: 'cleared-before-save',
      code: 'explicitly restored',
      language: 'python',
      baseRevision: 1,
    })
    assert.equal(restoredAfterClear.status, 'saved')
    const staleRepeatedClear = repository.clearExerciseDraft(reopened, 'cleared-before-save', 0)
    assert.equal(staleRepeatedClear.status, 'conflict')
    assert.equal(staleRepeatedClear.current.code, 'explicitly restored')
    reopened.close()
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

app
  .whenReady()
  .then(() => {
    run()
    console.log('DRAFT_ELECTRON_E2E_OK')
    finishIsolatedElectronTest(app, isolatedUserData, 0)
  })
  .catch((error) => {
    console.error(error)
    finishIsolatedElectronTest(app, isolatedUserData, 1)
  })
