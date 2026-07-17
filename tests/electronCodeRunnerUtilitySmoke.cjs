/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- Electron smoke harness. */
const { app } = require('electron')
const { execFileSync } = require('child_process')
const { existsSync, readdirSync, rmSync } = require('fs')
const { randomUUID } = require('crypto')
const { join } = require('path')
const { tmpdir } = require('os')
const {
  createIsolatedElectronUserData,
  finishIsolatedElectronTest,
} = require('../scripts/electron-test-user-data.cjs')

const isolatedUserData = createIsolatedElectronUserData(app, 'codehelper-runner-utility-user-data-')

app.commandLine.appendSwitch('no-sandbox')

const root = join(__dirname, '..')
const chunksDirectory = join(root, 'out', 'main', 'chunks')
const utilityPath = join(root, 'out', 'main', 'codeRunnerUtility.js')
const hostPath = join(root, 'resources', 'bin', 'win32-x64', 'codehelper-job-host.exe')
const runRootBase = join(tmpdir(), 'codehelper-run')

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ])
}

function loadBuiltSupervisor() {
  const matches = readdirSync(chunksDirectory).filter((filename) =>
    /^codeRunnerSupervisor-[\w-]+\.js$/.test(filename),
  )
  if (matches.length !== 1) {
    throw new Error(`expected one built supervisor chunk, found: ${matches.join(', ') || 'none'}`)
  }
  return require(join(chunksDirectory, matches[0]))
}

function utilityRunRoots() {
  if (!existsSync(runRootBase)) return new Set()
  return new Set(
    readdirSync(runRootBase, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('utility_'))
      .map((entry) => entry.name),
  )
}

function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('CODE_RUNNER_UTILITY_SMOKE_SKIPPED_NON_WINDOWS')
    return
  }
  if (!existsSync(utilityPath)) throw new Error(`missing utility bundle: ${utilityPath}`)
  if (!existsSync(hostPath)) throw new Error(`missing job host: ${hostPath}`)

  const { runCodeInUtility } = loadBuiltSupervisor()
  if (typeof runCodeInUtility !== 'function') {
    throw new Error('built supervisor does not export runCodeInUtility')
  }

  const nodeCommand = execFileSync('where.exe', ['node.exe'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!nodeCommand) throw new Error('Node.js executable was not found')

  const marker = join(tmpdir(), `codehelper-job-escape-${randomUUID()}.txt`)
  const rootsBeforeRun = utilityRunRoots()
  const nodeToolchain = {
    id: 'node',
    languageIds: ['javascript', 'node'],
    status: 'ready',
    command: nodeCommand,
    message: 'Node.js ready',
  }
  const runJavaScript = (code) =>
    withTimeout(
      runCodeInUtility({
        kind: 'run-code',
        code,
        language: 'javascript',
        toolchain: nodeToolchain,
      }),
      20_000,
      'supervised runner timed out',
    )
  try {
    const escapedChildCode = [
      "const { spawn } = require('child_process')",
      "const child = spawn(process.execPath, ['-e', " +
        JSON.stringify(
          `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'escaped'), 1200)`,
        ) +
        "], { detached: true, stdio: 'inherit' })",
      'child.unref()',
      "console.log('child-pid:' + child.pid)",
      "console.log('root-finished')",
    ].join('\n')

    const result = await runJavaScript(escapedChildCode)
    if (result.exitCode !== 0 || !result.stdout.includes('root-finished')) {
      throw new Error(`unexpected runner result: ${JSON.stringify(result)}`)
    }
    const childPidMatch = result.stdout.match(/^child-pid:(\d+)$/m)
    const childPid = childPidMatch ? Number(childPidMatch[1]) : 0
    if (!Number.isSafeInteger(childPid) || childPid <= 0) {
      throw new Error(`runner did not report a valid descendant PID: ${JSON.stringify(result)}`)
    }
    if (processExists(childPid)) {
      throw new Error(`supervisor returned before the Windows Job was empty: ${childPid}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 1_600))
    if (existsSync(marker)) throw new Error('detached descendant escaped the Windows Job Object')
    const leakedRoots = [...utilityRunRoots()].filter((entry) => !rootsBeforeRun.has(entry))
    if (leakedRoots.length > 0) {
      throw new Error(`supervised runner leaked temporary roots: ${leakedRoots.join(', ')}`)
    }

    const atCap = await runJavaScript("process.stdout.write('x'.repeat(1024 * 1024))")
    if (atCap.exitCode !== 0 || Buffer.byteLength(atCap.stdout) !== 1024 * 1024) {
      throw new Error(
        `runner truncated output at the cap: ${JSON.stringify({
          exitCode: atCap.exitCode,
          stdoutBytes: Buffer.byteLength(atCap.stdout),
          stderr: atCap.stderr,
        })}`,
      )
    }

    const overCap = await runJavaScript("process.stdout.write('x'.repeat(1024 * 1024 + 1))")
    if (overCap.exitCode !== 1 || !overCap.stderr.includes('输出超过1MB限制')) {
      throw new Error(`runner failed to enforce the output cap: ${JSON.stringify(overCap)}`)
    }

    console.log('CODE_RUNNER_UTILITY_SMOKE_OK')
  } finally {
    rmSync(marker, { force: true })
  }
}

app
  .whenReady()
  .then(main)
  .then(() => finishIsolatedElectronTest(app, isolatedUserData, 0))
  .catch((error) => {
    console.error(error)
    finishIsolatedElectronTest(app, isolatedUserData, 1)
  })
