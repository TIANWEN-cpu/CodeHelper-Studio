/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')
const Database = require('better-sqlite3')

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

function assertBufferEqual(actual, expected, label = 'buffer') {
  assert.equal(Buffer.compare(actual, expected), 0, `${label} bytes changed`)
}

function run() {
  const { openDatabaseWithRecovery } = loadTypeScriptModule(
    path.join(__dirname, '..', 'electron', 'db', 'databaseRecovery.ts'),
  )
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codehelper-database-recovery-'))

  try {
    const databasePath = path.join(directory, 'codehelper.db')
    const originalFiles = new Map([
      [databasePath, Buffer.from('not a sqlite database\0valuable database bytes')],
      [`${databasePath}-wal`, Buffer.from('valuable wal bytes\0unchanged')],
      [`${databasePath}-shm`, Buffer.from('valuable shm bytes\0unchanged')],
    ])
    for (const [filename, content] of originalFiles) fs.writeFileSync(filename, content)

    const collisionTimestamp = 1_750_000_000_000
    const collisionPath = `${databasePath}.corrupt.${collisionTimestamp}`
    fs.writeFileSync(collisionPath, 'existing recovery backup')
    const originalDateNow = Date.now
    Date.now = () => collisionTimestamp

    let recovered
    try {
      recovered = openDatabaseWithRecovery(databasePath, (database) => {
        database.exec(`
          CREATE TABLE recovery_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
          INSERT INTO recovery_probe (value) VALUES ('fresh database initialized');
        `)
      })
    } finally {
      Date.now = originalDateNow
    }
    try {
      assert.ok(recovered.recoveryNotice)
      assert.equal(recovered.recoveryNotice.reason, 'SQLITE_NOTADB')
      assert.equal(recovered.recoveryNotice.databasePath, databasePath)
      assert.equal(recovered.recoveryNotice.backupPath, `${databasePath}.corrupt.1750000000001`)
      assert.equal(recovered.recoveryNotice.isolatedFiles.length, 3)
      assert.equal(fs.readFileSync(collisionPath, 'utf8'), 'existing recovery backup')

      for (const isolated of recovered.recoveryNotice.isolatedFiles) {
        assert.equal(fs.existsSync(isolated.sourcePath), isolated.sourcePath === databasePath)
        assert.equal(fs.existsSync(isolated.backupPath), true)
        assertBufferEqual(
          fs.readFileSync(isolated.backupPath),
          originalFiles.get(isolated.sourcePath),
          isolated.sourcePath,
        )
      }

      assert.deepEqual(recovered.database.prepare('SELECT id, value FROM recovery_probe').get(), {
        id: 1,
        value: 'fresh database initialized',
      })
      assert.equal(recovered.database.pragma('quick_check', { simple: true }), 'ok')
    } finally {
      recovered.database.close()
    }

    const reopened = openDatabaseWithRecovery(databasePath, () => {})
    try {
      assert.equal(reopened.recoveryNotice, null)
      assert.equal(
        reopened.database.prepare('SELECT value FROM recovery_probe WHERE id = 1').pluck().get(),
        'fresh database initialized',
      )
    } finally {
      reopened.database.close()
    }

    const initializationErrorPath = path.join(directory, 'initialization-error.db')
    const valid = new Database(initializationErrorPath)
    valid.exec(`
      CREATE TABLE preserved (value TEXT NOT NULL);
      INSERT INTO preserved (value) VALUES ('must survive');
    `)
    valid.close()
    const bytesBeforeError = fs.readFileSync(initializationErrorPath)
    const initializationError = new Error('ordinary initialization failure')
    let thrown
    try {
      openDatabaseWithRecovery(initializationErrorPath, () => {
        throw initializationError
      })
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown, initializationError)
    assertBufferEqual(fs.readFileSync(initializationErrorPath), bytesBeforeError)
    assert.deepEqual(
      fs
        .readdirSync(directory)
        .filter((name) => name.startsWith('initialization-error.db.corrupt.')),
      [],
    )

    const renamedPath = path.join(directory, 'initialization-error-closed.db')
    fs.renameSync(initializationErrorPath, renamedPath)
    fs.renameSync(renamedPath, initializationErrorPath)
    const preserved = new Database(initializationErrorPath, { readonly: true })
    try {
      assert.equal(preserved.prepare('SELECT value FROM preserved').pluck().get(), 'must survive')
    } finally {
      preserved.close()
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

try {
  run()
  console.log('DATABASE_RECOVERY_ELECTRON_OK')
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
