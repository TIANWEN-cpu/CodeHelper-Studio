/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- Node.js native build script. */
// Builds the Windows x64 Job Object host shipped outside app.asar.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'native', 'windows', 'codehelper-job-host.cpp')
const outputDirectory = path.join(root, 'resources', 'bin', 'win32-x64')
const outputPath = path.join(outputDirectory, 'codehelper-job-host.exe')
const objectPath = path.join(outputDirectory, 'codehelper-job-host.obj')

if (process.platform !== 'win32') {
  console.log('[build-job-host] skipped: the native Job Object host is Windows-only.')
  process.exit(0)
}

function uniqueExistingFiles(candidates) {
  const seen = new Set()
  const files = []
  for (const candidate of candidates) {
    if (!candidate) continue
    const resolved = path.resolve(candidate.trim())
    const key = resolved.toLowerCase()
    if (!seen.has(key) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      seen.add(key)
      files.push(resolved)
    }
  }
  return files
}

function findOnPath(executable) {
  const result = spawnSync('where.exe', [executable], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0 || !result.stdout) return []
  return result.stdout.split(/\r?\n/).filter(Boolean)
}

function findX64Gxx() {
  const candidates = uniqueExistingFiles([
    ...findOnPath('g++.exe'),
    ...findOnPath('x86_64-w64-mingw32-g++.exe'),
    'C:\\Strawberry\\c\\bin\\g++.exe',
    'C:\\msys64\\ucrt64\\bin\\g++.exe',
    'C:\\msys64\\mingw64\\bin\\g++.exe',
  ])

  for (const compiler of candidates) {
    const probe = spawnSync(compiler, ['-dumpmachine'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    const target = (probe.stdout || '').trim().toLowerCase()
    if (probe.status === 0 && /^(x86_64|amd64)-/.test(target)) {
      return compiler
    }
  }
  return null
}

function findVswhere() {
  return uniqueExistingFiles([
    ...findOnPath('vswhere.exe'),
    process.env['ProgramFiles(x86)'] &&
      path.join(
        process.env['ProgramFiles(x86)'],
        'Microsoft Visual Studio',
        'Installer',
        'vswhere.exe',
      ),
    process.env.ProgramFiles &&
      path.join(process.env.ProgramFiles, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'),
  ])[0]
}

function readVisualStudioEnvironment(vcvars64Path) {
  const command = `call "${vcvars64Path}" >nul && set`
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) return null

  const environment = { ...process.env }
  for (const line of result.stdout.split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    environment[line.slice(0, separator)] = line.slice(separator + 1)
  }
  return environment
}

function findVisualStudioCl() {
  const pathCompiler = uniqueExistingFiles(findOnPath('cl.exe'))[0]
  if (pathCompiler) {
    return { compiler: pathCompiler, environment: process.env }
  }

  const vswhere = findVswhere()
  if (!vswhere) return null
  const query = spawnSync(
    vswhere,
    [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  const installationPath = (query.stdout || '').trim()
  if (query.status !== 0 || !installationPath) return null

  const toolsRoot = path.join(installationPath, 'VC', 'Tools', 'MSVC')
  const vcvars64Path = path.join(installationPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat')
  if (!fs.existsSync(toolsRoot) || !fs.existsSync(vcvars64Path)) return null

  const versions = fs
    .readdirSync(toolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))

  for (const version of versions) {
    const compiler = path.join(toolsRoot, version, 'bin', 'Hostx64', 'x64', 'cl.exe')
    if (!fs.existsSync(compiler)) continue
    const environment = readVisualStudioEnvironment(vcvars64Path)
    if (environment) return { compiler, environment }
  }
  return null
}

function runCompiler(compiler, args, environment = process.env) {
  console.log(`[build-job-host] compiler: ${compiler}`)
  const result = spawnSync(compiler, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  })
  return result.status === 0
}

function compileWithGxx(compiler) {
  return runCompiler(compiler, [
    '-std=c++17',
    '-O2',
    '-DNDEBUG',
    '-DUNICODE',
    '-D_UNICODE',
    '-Wall',
    '-Wextra',
    '-Wpedantic',
    '-fstack-protector-strong',
    '-static',
    '-Wl,--subsystem,console',
    '-Wl,--dynamicbase',
    '-Wl,--nxcompat',
    '-Wl,--high-entropy-va',
    '-Wl,--no-insert-timestamp',
    sourcePath,
    '-o',
    outputPath,
  ])
}

function compileWithCl(toolchain) {
  return runCompiler(
    toolchain.compiler,
    [
      '/nologo',
      '/std:c++17',
      '/O2',
      '/W4',
      '/EHsc',
      '/MT',
      '/DNDEBUG',
      '/DUNICODE',
      '/D_UNICODE',
      '/DWIN32_LEAN_AND_MEAN',
      '/DNOMINMAX',
      `/Fo${objectPath}`,
      `/Fe${outputPath}`,
      sourcePath,
      '/link',
      '/SUBSYSTEM:CONSOLE',
      '/DYNAMICBASE',
      '/NXCOMPAT',
      '/HIGHENTROPYVA',
      '/Brepro',
    ],
    toolchain.environment,
  )
}

function assertX64PortableExecutable(filePath) {
  const file = fs.readFileSync(filePath)
  if (file.length < 0x40 || file.readUInt16LE(0) !== 0x5a4d) {
    throw new Error('compiler output is not a PE executable')
  }
  const peOffset = file.readUInt32LE(0x3c)
  if (peOffset + 6 > file.length || file.readUInt32LE(peOffset) !== 0x00004550) {
    throw new Error('compiler output has an invalid PE header')
  }
  if (file.readUInt16LE(peOffset + 4) !== 0x8664) {
    throw new Error('compiler output is not an x64 PE executable')
  }
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`[build-job-host] missing source: ${sourcePath}`)
}

fs.mkdirSync(outputDirectory, { recursive: true })
fs.rmSync(outputPath, { force: true })
fs.rmSync(objectPath, { force: true })

const failures = []
const gxx = findX64Gxx()
if (gxx && !compileWithGxx(gxx)) {
  failures.push(`MinGW g++ failed: ${gxx}`)
  fs.rmSync(outputPath, { force: true })
}

if (!fs.existsSync(outputPath)) {
  const cl = findVisualStudioCl()
  if (cl && !compileWithCl(cl)) {
    failures.push(`Visual Studio cl failed: ${cl.compiler}`)
    fs.rmSync(outputPath, { force: true })
  }
}

fs.rmSync(objectPath, { force: true })

if (!fs.existsSync(outputPath)) {
  const details = failures.length > 0 ? `\n${failures.join('\n')}` : ''
  throw new Error(
    '[build-job-host] no usable x64 compiler found. Install MinGW-w64 g++ or Visual Studio C++ Build Tools.' +
      details,
  )
}

assertX64PortableExecutable(outputPath)
const size = fs.statSync(outputPath).size
console.log(`[build-job-host] wrote x64 host: ${outputPath} (${size} bytes)`)
