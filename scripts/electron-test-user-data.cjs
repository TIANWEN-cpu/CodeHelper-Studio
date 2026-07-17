/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- CommonJS Electron harness helper. */
const assert = require('node:assert/strict')
const { existsSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { basename, dirname, join, resolve } = require('node:path')

function comparablePath(value) {
  const normalized = resolve(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function assertSafeTemporaryUserDataPath(userDataPath, prefix, tempRoot = tmpdir()) {
  const resolvedPath = resolve(userDataPath)
  const resolvedTempRoot = resolve(tempRoot)
  assert.equal(
    comparablePath(dirname(resolvedPath)),
    comparablePath(resolvedTempRoot),
    'refusing to remove Electron userData outside the OS temporary directory',
  )
  assert.ok(
    basename(resolvedPath).startsWith(prefix) && basename(resolvedPath).length > prefix.length,
    'refusing to remove Electron userData without the expected unique prefix',
  )
  return resolvedPath
}

function createIsolatedElectronUserData(targetApp, prefix) {
  if (targetApp.isReady()) {
    throw new Error('Electron userData isolation must be configured before app.whenReady()')
  }
  if (!/^codehelper-[a-z0-9-]+-$/.test(prefix)) {
    throw new Error('Electron test userData prefix must be a scoped codehelper prefix')
  }

  const defaultUserDataPath = resolve(targetApp.getPath('userData'))
  const appDataPath = resolve(targetApp.getPath('appData'))
  const formalProfilePaths = [
    defaultUserDataPath,
    resolve(appDataPath, 'codehelper'),
    resolve(appDataPath, 'CodeHelper'),
  ]
  const userDataPath = resolve(mkdtempSync(join(tmpdir(), prefix)))
  assertSafeTemporaryUserDataPath(userDataPath, prefix)

  try {
    for (const formalProfilePath of formalProfilePaths) {
      assert.notEqual(
        comparablePath(userDataPath),
        comparablePath(formalProfilePath),
        `Electron test userData must not use the formal profile: ${formalProfilePath}`,
      )
    }
    targetApp.setPath('userData', userDataPath)
    assert.equal(
      comparablePath(targetApp.getPath('userData')),
      comparablePath(userDataPath),
      'Electron did not select the isolated test userData directory',
    )
  } catch (error) {
    rmSync(userDataPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    throw error
  }

  let cleaned = false
  const cleanupAtExit = () => {
    try {
      cleanup()
    } catch (error) {
      console.error('Failed to remove isolated Electron userData:', error)
      process.exitCode = 1
    }
  }
  const cleanup = () => {
    if (cleaned) return
    const safePath = assertSafeTemporaryUserDataPath(userDataPath, prefix)
    rmSync(safePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    assert.equal(existsSync(safePath), false, 'isolated Electron userData was not removed')
    cleaned = true
    process.removeListener('exit', cleanupAtExit)
  }

  process.once('exit', cleanupAtExit)
  return Object.freeze({
    path: userDataPath,
    formalProfilePaths: Object.freeze(formalProfilePaths),
    cleanup,
  })
}

function finishIsolatedElectronTest(targetApp, isolation, exitCode) {
  let finalExitCode = exitCode
  try {
    isolation.cleanup()
  } catch (error) {
    console.error('Failed to clean isolated Electron userData:', error)
    finalExitCode = 1
  }
  targetApp.exit(finalExitCode)
}

module.exports = {
  assertSafeTemporaryUserDataPath,
  createIsolatedElectronUserData,
  finishIsolatedElectronTest,
}
