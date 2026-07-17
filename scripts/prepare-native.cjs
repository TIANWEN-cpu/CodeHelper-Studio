/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const workspace = path.resolve(__dirname, '..')
const nativeModule = 'better-sqlite3'
const target = process.argv[2]
const force = process.argv.includes('--force')

if (target !== 'node' && target !== 'electron') {
  console.error('Usage: node scripts/prepare-native.cjs <node|electron> [--force]')
  process.exit(2)
}

const smokeScript = `
  const Database = require(${JSON.stringify(nativeModule)});
  const database = new Database(':memory:');
  database.prepare('SELECT 1').get();
  database.close();
  process.stdout.write(process.versions.modules || 'unknown');
`

function probeRuntime() {
  if (target === 'node') {
    return spawnSync(process.execPath, ['-e', smokeScript], {
      cwd: workspace,
      encoding: 'utf8',
      windowsHide: true,
    })
  }

  const electronPath = require('electron')
  return spawnSync(electronPath, ['-e', smokeScript], {
    cwd: workspace,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    windowsHide: true,
  })
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: workspace,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function rebuildForNode() {
  const npmCli = process.env.npm_execpath
  if (npmCli && /\.(?:c?js)$/i.test(npmCli)) {
    run(process.execPath, [npmCli, 'rebuild', nativeModule])
    return
  }

  if (process.platform === 'win32') {
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd rebuild ${nativeModule}`])
    return
  }

  run('npm', ['rebuild', nativeModule])
}

function rebuildForElectron() {
  const electronVersion = require('electron/package.json').version
  const rebuildEntry = require.resolve('@electron/rebuild')
  const rebuildCli = path.join(path.dirname(rebuildEntry), 'cli.js')

  run(process.execPath, [
    rebuildCli,
    '--force',
    '--which-module',
    nativeModule,
    '--version',
    electronVersion,
  ])
}

function runtimeLabel() {
  if (target === 'node') return `Node ${process.version}`
  return `Electron ${require('electron/package.json').version}`
}

let probe = force ? null : probeRuntime()
if (probe?.status === 0) {
  console.log(
    `[native] ${nativeModule} is ready for ${runtimeLabel()} (ABI ${probe.stdout.trim()}).`,
  )
  process.exit(0)
}

console.log(`[native] Preparing ${nativeModule} for ${runtimeLabel()}...`)
if (target === 'node') rebuildForNode()
else rebuildForElectron()

probe = probeRuntime()
if (probe.error) throw probe.error
if (probe.status !== 0) {
  if (probe.stdout) process.stdout.write(probe.stdout)
  if (probe.stderr) process.stderr.write(probe.stderr)
  console.error(`[native] ${nativeModule} is still incompatible with ${runtimeLabel()}.`)
  process.exit(probe.status ?? 1)
}

console.log(`[native] ${nativeModule} is ready for ${runtimeLabel()} (ABI ${probe.stdout.trim()}).`)
