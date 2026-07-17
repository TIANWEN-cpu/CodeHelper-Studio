/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- Windows release verifier. */

const { createHash, randomBytes } = require('node:crypto')
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const distRoot = path.join(root, 'dist-release')
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = packageJson.version
const installerName = `CodeHelper-Installer-${version}.exe`
const portableName = `CodeHelper-${version}-Portable.exe`
const expectedArtifacts = [installerName, `${installerName}.blockmap`, portableName, 'latest.yml']
const configuredSignerThumbprint = process.env.CODEHELPER_EXPECTED_SIGNER_THUMBPRINT?.trim()
const expectedSignerThumbprint = configuredSignerThumbprint
  ? configuredSignerThumbprint.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
  : null
const requireSignature =
  process.env.CODEHELPER_REQUIRE_SIGNATURE === '1' || expectedSignerThumbprint !== null

if (expectedSignerThumbprint && !/^[A-F0-9]{40}$/.test(expectedSignerThumbprint)) {
  throw new Error(
    '[verify-windows-package] CODEHELPER_EXPECTED_SIGNER_THUMBPRINT must be a 40-character certificate thumbprint',
  )
}

function fail(message) {
  throw new Error(`[verify-windows-package] ${message}`)
}

function outputDetails(result) {
  const stdout = result.stdout ? `\nstdout:\n${result.stdout}` : ''
  const stderr = result.stderr ? `\nstderr:\n${result.stderr}` : ''
  return `${stdout}${stderr}`
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    windowsHide: true,
    stdio: options.stdio ?? 'pipe',
    timeout: options.timeout ?? 180_000,
    maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
    env: options.env ?? process.env,
  })
  if (result.error) {
    fail(`${command} failed: ${result.error.message}${outputDetails(result)}`)
  }
  if (result.status !== 0) {
    fail(`${command} exited with ${result.status}${outputDetails(result)}`)
  }
  return result
}

function createWindowsPowerShellEnvironment(overrides = {}, baseEnvironment = process.env) {
  const environment = { ...baseEnvironment, ...overrides }
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === 'psmodulepath') delete environment[key]
  }
  return environment
}

function runWindowsPowerShell(script, options = {}) {
  const { env = {}, ...runOptions } = options
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    ...runOptions,
    env: createWindowsPowerShellEnvironment(env),
  })
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function sha512Base64(filePath) {
  return createHash('sha512').update(readFileSync(filePath)).digest('base64')
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function normalizeThumbprint(value) {
  return typeof value === 'string' ? value.replace(/[^a-fA-F0-9]/g, '').toUpperCase() : null
}

function buildAuthenticodePowerShellScript() {
  return [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
    "$securityModule = Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1'",
    'if (-not (Test-Path -LiteralPath $securityModule -PathType Leaf)) {',
    "  throw 'The host-local Microsoft.PowerShell.Security module is unavailable'",
    '}',
    'Import-Module -Name $securityModule -Force -ErrorAction Stop',
    '$signature = Microsoft.PowerShell.Security\\Get-AuthenticodeSignature -LiteralPath $env:CODEHELPER_SIGNATURE_PATH',
    '[pscustomobject]@{',
    '  status = [string]$signature.Status',
    '  statusMessage = [string]$signature.StatusMessage',
    '  signerSubject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }',
    '  signerThumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }',
    '  timestampThumbprint = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Thumbprint } else { $null }',
    '} | ConvertTo-Json -Compress',
  ].join('\n')
}

function readAuthenticode(filePath) {
  const result = runWindowsPowerShell(buildAuthenticodePowerShellScript(), {
    env: { CODEHELPER_SIGNATURE_PATH: filePath },
  })
  return JSON.parse(result.stdout.trim())
}

function requireValidSignature(name, signature) {
  if (!requireSignature) return
  if (signature.status !== 'Valid') fail(`${name} signature is ${signature.status}`)
  const signerThumbprint = normalizeThumbprint(signature.signerThumbprint)
  if (!signerThumbprint) fail(`${name} signature has no signer certificate`)
  if (!signature.timestampThumbprint) fail(`${name} signature has no timestamp certificate`)
  if (expectedSignerThumbprint && signerThumbprint !== expectedSignerThumbprint) {
    fail(`${name} signer does not match CODEHELPER_EXPECTED_SIGNER_THUMBPRINT`)
  }
}

function requireMatchingSigner(name, signature, expectedSignature) {
  const actual = normalizeThumbprint(signature.signerThumbprint)
  const expected = normalizeThumbprint(expectedSignature.signerThumbprint)
  if (expected && actual !== expected) {
    fail(`${name} signer does not match win-unpacked/CodeHelper.exe`)
  }
}

function parseYamlScalar(value) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"')) return JSON.parse(trimmed)
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'")
  }
  return trimmed
}

function parseLatestManifest(contents) {
  const manifest = { files: [] }
  let inFiles = false
  let currentFile = null

  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const indentation = line.match(/^\s*/)[0].length
    const trimmed = line.trim()

    if (indentation === 0) {
      inFiles = trimmed === 'files:'
      currentFile = null
      if (inFiles) continue
      const match = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.*)$/)
      if (match) manifest[match[1]] = parseYamlScalar(match[2])
      continue
    }

    if (!inFiles) continue
    const item = trimmed.match(/^-\s+url:\s*(.*)$/)
    if (item) {
      currentFile = { url: parseYamlScalar(item[1]) }
      manifest.files.push(currentFile)
      continue
    }
    const property = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.*)$/)
    if (currentFile && property) currentFile[property[1]] = parseYamlScalar(property[2])
  }

  return manifest
}

function verifyLatestManifest(installerPath) {
  const latestPath = path.join(distRoot, 'latest.yml')
  const latest = parseLatestManifest(readFileSync(latestPath, 'utf8'))
  const installerSize = statSync(installerPath).size
  const installerSha512 = sha512Base64(installerPath)

  if (latest.version !== version) fail('latest.yml version does not match package.json')
  if (latest.path !== installerName) fail(`latest.yml does not point to ${installerName}`)
  if (latest.sha512 !== installerSha512) fail('latest.yml root sha512 does not match the installer')
  if (latest.files.length !== 1) fail('latest.yml must contain exactly one updater file')
  const updaterFile = latest.files[0]
  if (updaterFile.url !== installerName)
    fail(`latest.yml file URL does not point to ${installerName}`)
  if (updaterFile.sha512 !== installerSha512) {
    fail('latest.yml file sha512 does not match the installer')
  }
  if (!/^\d+$/.test(String(updaterFile.size)) || Number(updaterFile.size) !== installerSize) {
    fail('latest.yml file size does not match the installer')
  }
  if (!latest.releaseDate || Number.isNaN(Date.parse(latest.releaseDate))) {
    fail('latest.yml releaseDate is missing or invalid')
  }

  return {
    path: latest.path,
    bytes: installerSize,
    sha512: installerSha512,
    releaseDate: latest.releaseDate,
  }
}

function createFileRecord(name, filePath, signature = null) {
  return {
    name,
    bytes: statSync(filePath).size,
    sha256: sha256(filePath),
    ...(signature ? { authenticode: signature } : {}),
  }
}

function writeReleaseManifest({ records, packagedExecutable, packagedResources, updater, smokes }) {
  const checkedOutCommit = run('git', ['rev-parse', 'HEAD']).stdout.trim()
  const releaseCommit = process.env.CODEHELPER_RELEASE_SHA?.trim()
  if (releaseCommit && releaseCommit.toLowerCase() !== checkedOutCommit.toLowerCase()) {
    fail('CODEHELPER_RELEASE_SHA does not match the checked-out commit')
  }
  const generatedAt = new Date().toISOString()
  const manifest = {
    schemaVersion: 1,
    product: 'CodeHelper',
    version,
    sourceCommit: checkedOutCommit,
    workflowCommit:
      process.env.CODEHELPER_WORKFLOW_SHA?.trim() || process.env.GITHUB_SHA?.trim() || null,
    generatedAt,
    signatureRequired: requireSignature,
    expectedSignerThumbprint,
    updater,
    packagedExecutable,
    packagedResources,
    smokeTests: smokes,
    verification: {
      packageResources: true,
      electronFuses: true,
      updaterManifest: true,
      portableRuntime: true,
      portableExtractionCleanup: true,
      silentInstall: true,
      installedRuntime: true,
      restartPersistence: true,
      silentUninstall: true,
    },
    artifacts: records,
  }
  writeFileSync(
    path.join(distRoot, 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  writeFileSync(
    path.join(distRoot, 'SHA256SUMS.txt'),
    `${records.map((record) => `${record.sha256}  ${record.name}`).join('\n')}\n`,
    'utf8',
  )
}

function waitForFile(filePath, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return
    sleep(200)
  }
  fail(`timed out waiting for ${filePath}`)
}

function waitForRemoval(filePath, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!existsSync(filePath)) return
    sleep(200)
  }
  fail(`timed out waiting for removal of ${filePath}`)
}

function listSmokeProcesses(token) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
    'Get-CimInstance Win32_Process | Where-Object {',
    '  $_.CommandLine -and $_.CommandLine.Contains($env:CODEHELPER_SMOKE_TOKEN)',
    '} | ForEach-Object { [Console]::WriteLine([string]$_.ProcessId) }',
  ].join('\n')
  const result = runWindowsPowerShell(script, {
    env: { CODEHELPER_SMOKE_TOKEN: token },
    timeout: 30_000,
  })
  return result.stdout
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0)
}

function listExecutableProcesses(executablePath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
    'Get-CimInstance Win32_Process | Where-Object {',
    '  $_.ExecutablePath -and [string]::Equals(',
    '    $_.ExecutablePath,',
    '    $env:CODEHELPER_SMOKE_EXECUTABLE,',
    '    [System.StringComparison]::OrdinalIgnoreCase',
    '  )',
    '} | ForEach-Object { [Console]::WriteLine([string]$_.ProcessId) }',
  ].join('\n')
  const result = runWindowsPowerShell(script, {
    env: { CODEHELPER_SMOKE_EXECUTABLE: executablePath },
    timeout: 30_000,
  })
  return result.stdout
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0)
}

function stopProcesses(processIds) {
  const unique = [...new Set(processIds)]
  if (unique.length === 0) return
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$ids = $env:CODEHELPER_PROCESS_IDS.Split(",") | ForEach-Object { [int]$_ }',
    'Stop-Process -Id $ids -Force -ErrorAction SilentlyContinue',
  ].join('\n')
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    env: createWindowsPowerShellEnvironment({ CODEHELPER_PROCESS_IDS: unique.join(',') }),
  })
}

function cleanupSmokeProcesses(token, rootPid) {
  let processIds = []
  try {
    processIds = listSmokeProcesses(token)
  } catch {
    // taskkill below remains a best-effort fallback for verifier failures.
  }
  stopProcesses(processIds)
  if (Number.isSafeInteger(rootPid) && rootPid > 0) {
    spawnSync('taskkill.exe', ['/PID', String(rootPid), '/T', '/F'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    })
  }
}

function waitForExecutableExit(executablePath, token, rootPid, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let remaining = []
  while (Date.now() < deadline) {
    remaining = listExecutableProcesses(executablePath)
    if (remaining.length === 0) return
    sleep(500)
  }
  cleanupSmokeProcesses(token, rootPid)
  fail(`packaged smoke left running processes for ${executablePath}: ${remaining.join(', ')}`)
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

function validateSmokePayload(payload, phase, label, expectedJobHostSha256, expectedUserDataPath) {
  if (!payload || typeof payload !== 'object') fail(`${label} ${phase} smoke returned invalid JSON`)
  if (payload.ok !== true) {
    fail(`${label} ${phase} smoke failed: ${payload.error || 'unknown packaged error'}`)
  }
  if (payload.isPackaged !== true) fail(`${label} ${phase} smoke did not run in a packaged app`)
  if (payload.phase !== phase) fail(`${label} smoke phase mismatch`)
  if (payload.version !== version) fail(`${label} smoke version does not match package.json`)
  for (const key of ['executablePath', 'userDataPath', 'appPath', 'resourcesPath']) {
    if (typeof payload[key] !== 'string' || !path.isAbsolute(payload[key])) {
      fail(`${label} ${phase} smoke has invalid ${key}`)
    }
  }
  if (
    path.resolve(payload.userDataPath).toLowerCase() !==
    path.resolve(expectedUserDataPath).toLowerCase()
  ) {
    fail(`${label} ${phase} smoke used an unexpected userData directory`)
  }
  const resources = payload.resourceChecks
  if (
    !resources ||
    resources.appPathIsAsar !== true ||
    resources.appAsarPresent !== true ||
    resources.jobHostPresent !== true ||
    resources.databaseSchemaPresent !== true ||
    resources.courseMetadataPresent !== true ||
    resources.allRequiredPresent !== true
  ) {
    fail(`${label} ${phase} smoke did not verify all packaged resources`)
  }
  if (resources.jobHostSha256 !== expectedJobHostSha256) {
    fail(`${label} ${phase} smoke Job Host hash does not match win-unpacked`)
  }

  const result = payload.result
  if (!result || typeof result !== 'object') fail(`${label} ${phase} smoke result is missing`)
  if (phase === 'exercise') {
    if (
      result.workspaceSaved !== true ||
      result.sqlExitCode !== 0 ||
      result.nodeExitCode !== 0 ||
      result.nodeStage !== 'run' ||
      result.nodeStdout !== 'PACKAGED_NODE_OK' ||
      result.knowledgeSource !== 'package-smoke/release-gate.md' ||
      typeof result.agentRunId !== 'string' ||
      !result.agentRunId ||
      typeof result.agentKnowledgeSource !== 'string' ||
      !result.agentKnowledgeSource.startsWith('package-smoke/release-gate.md#') ||
      result.agentCancelled !== true
    ) {
      fail(`${label} packaged core-loop smoke returned unexpected evidence`)
    }
  } else if (
    result.restoredTabId !== 'packaged-smoke-tab' ||
    result.restoredContent !== 'print("PACKAGED_WORKSPACE_OK")'
  ) {
    fail(`${label} packaged restart-persistence smoke returned unexpected evidence`)
  }
}

function launchPackagedSmokePhase({
  executablePath,
  label,
  phase,
  smokeRoot,
  packRoot,
  userDataPath,
  expectedJobHostSha256,
}) {
  const resultPath = path.join(smokeRoot, `codehelper-package-smoke-${label}-${phase}.json`)
  rmSync(resultPath, { force: true })
  const token = `codehelper-packaged-smoke-${randomBytes(12).toString('hex')}`
  const environment = {
    ...process.env,
    CODEHELPER_PACKAGED_SMOKE: '1',
    CODEHELPER_PACKAGED_SMOKE_PHASE: phase,
    CODEHELPER_PACKAGED_SMOKE_RESULT: resultPath,
    CODEHELPER_PACKAGED_SMOKE_PACK_ROOT: packRoot,
    CODEHELPER_E2E_USER_DATA: userDataPath,
    CODEHELPER_E2E_HEADLESS: '1',
  }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.ELECTRON_RENDERER_URL

  console.log(`[verify-windows-package] packaged smoke ${label}/${phase}: ${executablePath}`)
  const launched = spawnSync(executablePath, [`--${token}`], {
    cwd: path.dirname(executablePath),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
    env: environment,
  })

  try {
    if (launched.error) {
      fail(`${label} ${phase} launch failed: ${launched.error.message}${outputDetails(launched)}`)
    }
    if (launched.status !== 0) {
      fail(`${label} ${phase} exited with ${launched.status}${outputDetails(launched)}`)
    }
    waitForFile(resultPath, 90_000)
    if (statSync(resultPath).size > 1024 * 1024) fail(`${label} smoke result is unexpectedly large`)
    let payload
    try {
      payload = JSON.parse(readFileSync(resultPath, 'utf8'))
    } catch (error) {
      fail(`${label} ${phase} smoke result is invalid JSON: ${error.message}`)
    }
    validateSmokePayload(payload, phase, label, expectedJobHostSha256, userDataPath)
    waitForExecutableExit(payload.executablePath, token, launched.pid)
    if (label === 'portable') {
      const extractionRoot = path.dirname(payload.resourcesPath)
      if (!isPathInside(tmpdir(), extractionRoot)) {
        fail(
          `portable extraction path is outside the system temporary directory: ${extractionRoot}`,
        )
      }
      try {
        waitForRemoval(extractionRoot)
      } catch (error) {
        rmSync(extractionRoot, { recursive: true, force: true })
        throw error
      }
    }
    return payload
  } catch (error) {
    cleanupSmokeProcesses(token, launched.pid)
    throw error
  }
}

function runPackagedSmoke(executablePath, label, expectedJobHostSha256) {
  const smokeRoot = mkdtempSync(path.join(tmpdir(), `codehelper-package-${label}-`))
  const packRoot = path.join(smokeRoot, 'resource-pack')
  const userDataPath = path.join(smokeRoot, 'user-data')
  const knowledgeDirectory = path.join(packRoot, 'knowledge-docs', 'package-smoke')
  mkdirSync(knowledgeDirectory, { recursive: true })
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(
    path.join(packRoot, 'manifest.json'),
    `${JSON.stringify({ generated_at: new Date().toISOString(), source_root: 'p6-release-gate' })}\n`,
    'utf8',
  )
  writeFileSync(
    path.join(knowledgeDirectory, 'release-gate.md'),
    '# Packaged release gate\n\nA packaged release gate must expose an auditable source.\n',
    'utf8',
  )

  try {
    const exercise = launchPackagedSmokePhase({
      executablePath,
      label,
      phase: 'exercise',
      smokeRoot,
      packRoot,
      userDataPath,
      expectedJobHostSha256,
    })
    const verify = launchPackagedSmokePhase({
      executablePath,
      label,
      phase: 'verify',
      smokeRoot,
      packRoot,
      userDataPath,
      expectedJobHostSha256,
    })
    return {
      label,
      version,
      phases: ['exercise', 'verify'],
      jobHostSha256: exercise.resourceChecks.jobHostSha256,
      restartPersistence: verify.result.restoredTabId === 'packaged-smoke-tab',
      localControlledRunner:
        exercise.result.nodeExitCode === 0 &&
        exercise.result.nodeStage === 'run' &&
        exercise.result.nodeStdout === 'PACKAGED_NODE_OK',
      agentKnowledgeSource: exercise.result.agentKnowledgeSource,
      agentCancelled: exercise.result.agentCancelled,
      userDataIsolated: true,
      runtimeCleanupVerified: true,
    }
  } finally {
    rmSync(smokeRoot, { recursive: true, force: true })
  }
}

function combineFailures(primaryFailure, cleanupFailures) {
  if (!primaryFailure && cleanupFailures.length === 0) return null
  if (primaryFailure && cleanupFailures.length === 0) return primaryFailure
  const failures = [...(primaryFailure ? [primaryFailure] : []), ...cleanupFailures]
  return new AggregateError(failures, 'Windows package verification and cleanup failed')
}

function verifyInstalledPackage(installerPath, unpackedExecutable, unpackedSignature, jobHostHash) {
  const installRoot = mkdtempSync(path.join(tmpdir(), 'codehelper-install-smoke-'))
  const installDirectory = path.join(installRoot, 'CodeHelper')
  const installedExecutable = path.join(installDirectory, 'CodeHelper.exe')
  const uninstaller = path.join(installDirectory, 'Uninstall CodeHelper.exe')
  let primaryFailure = null
  const cleanupFailures = []
  let smoke = null

  try {
    console.log(`[verify-windows-package] silent install -> ${installDirectory}`)
    run(installerPath, ['/S', `/D=${installDirectory}`], { stdio: 'inherit', timeout: 180_000 })
    waitForFile(installedExecutable)
    waitForFile(uninstaller)

    const installedSignature = readAuthenticode(installedExecutable)
    requireValidSignature('installed CodeHelper.exe', installedSignature)
    requireMatchingSigner('installed CodeHelper.exe', installedSignature, unpackedSignature)
    if (sha256(installedExecutable) !== sha256(unpackedExecutable)) {
      fail('installed CodeHelper.exe hash does not match win-unpacked/CodeHelper.exe')
    }

    const uninstallerSignature = readAuthenticode(uninstaller)
    requireValidSignature('installed uninstaller', uninstallerSignature)
    requireMatchingSigner('installed uninstaller', uninstallerSignature, unpackedSignature)
    smoke = runPackagedSmoke(installedExecutable, 'installed', jobHostHash)
  } catch (error) {
    primaryFailure = error
  }

  try {
    if (existsSync(installedExecutable) || existsSync(uninstaller)) {
      if (!existsSync(uninstaller)) fail('installed package has no uninstaller')
      console.log(`[verify-windows-package] silent uninstall -> ${installDirectory}`)
      run(uninstaller, ['/S'], { stdio: 'inherit', timeout: 120_000 })
      waitForRemoval(installedExecutable)
      waitForRemoval(installDirectory)
      if (smoke) smoke.installationRemoved = true
    }
  } catch (error) {
    cleanupFailures.push(error)
  }

  try {
    rmSync(installRoot, { recursive: true, force: true })
    if (existsSync(installRoot)) fail(`temporary install directory remains: ${installRoot}`)
  } catch (error) {
    cleanupFailures.push(error)
  }

  const combinedFailure = combineFailures(primaryFailure, cleanupFailures)
  if (combinedFailure) throw combinedFailure
  return smoke
}

function main() {
  if (process.platform !== 'win32') fail('Windows package verification must run on Windows')

  run(process.execPath, [path.join(root, 'scripts', 'verify-package-resources.js')], {
    stdio: 'inherit',
  })

  const missing = expectedArtifacts.filter((name) => !existsSync(path.join(distRoot, name)))
  if (missing.length > 0) fail(`missing artifacts: ${missing.join(', ')}`)

  const installerPath = path.join(distRoot, installerName)
  const updater = verifyLatestManifest(installerPath)
  const unpackedExecutable = path.join(distRoot, 'win-unpacked', 'CodeHelper.exe')
  if (!existsSync(unpackedExecutable)) fail('win-unpacked/CodeHelper.exe is missing')
  const unpackedSignature = readAuthenticode(unpackedExecutable)
  requireValidSignature('win-unpacked/CodeHelper.exe', unpackedSignature)
  const packagedExecutable = createFileRecord(
    'win-unpacked/CodeHelper.exe',
    unpackedExecutable,
    unpackedSignature,
  )

  const jobHostPath = path.join(
    distRoot,
    'win-unpacked',
    'resources',
    'bin',
    'win32-x64',
    'codehelper-job-host.exe',
  )
  if (!existsSync(jobHostPath)) fail('packaged codehelper-job-host.exe is missing')
  const jobHostSignature = readAuthenticode(jobHostPath)
  requireValidSignature('packaged codehelper-job-host.exe', jobHostSignature)
  requireMatchingSigner('packaged codehelper-job-host.exe', jobHostSignature, unpackedSignature)
  const packagedResources = [
    createFileRecord(
      'win-unpacked/resources/bin/win32-x64/codehelper-job-host.exe',
      jobHostPath,
      jobHostSignature,
    ),
  ]

  const signatureTargets = new Set([installerName, portableName])
  const records = expectedArtifacts.map((name) => {
    const filePath = path.join(distRoot, name)
    const signature = signatureTargets.has(name) ? readAuthenticode(filePath) : null
    if (signature) {
      requireValidSignature(name, signature)
      requireMatchingSigner(name, signature, unpackedSignature)
    }
    const record = createFileRecord(name, filePath, signature)
    console.log(
      `[verify-windows-package] ${name}: ${record.bytes} bytes sha256=${record.sha256}${signature ? ` signature=${signature.status}` : ''}`,
    )
    return record
  })

  const portableSmoke = runPackagedSmoke(
    path.join(distRoot, portableName),
    'portable',
    packagedResources[0].sha256,
  )
  const installedSmoke = verifyInstalledPackage(
    installerPath,
    unpackedExecutable,
    unpackedSignature,
    packagedResources[0].sha256,
  )
  writeReleaseManifest({
    records,
    packagedExecutable,
    packagedResources,
    updater,
    smokes: [portableSmoke, installedSmoke],
  })
  console.log(
    '[verify-windows-package] installer, portable runtime, restart persistence, uninstall, updater metadata, hashes, and signatures verified.',
  )
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exit(1)
  }
}

module.exports = { buildAuthenticodePowerShellScript, createWindowsPowerShellEnvironment }
