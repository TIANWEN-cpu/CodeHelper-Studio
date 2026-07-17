// Verifies the unpacked Windows package includes runtime resources used by the app.

const fs = require('fs')
const path = require('path')
const { extractFile, listPackage } = require('@electron/asar')
const { FuseV1Options, getCurrentFuseWire } = require('@electron/fuses')

const FUSE_DISABLED = '0'.charCodeAt(0)
const FUSE_ENABLED = '1'.charCodeAt(0)

const root = path.resolve(__dirname, '..')
const resourcesRoot = process.env.CODEHELPER_PACKAGE_RESOURCES
  ? path.resolve(process.env.CODEHELPER_PACKAGE_RESOURCES)
  : path.join(root, 'dist-release', 'win-unpacked', 'resources')

const requiredPaths = [
  'app.asar',
  path.join('bin', 'win32-x64', 'codehelper-job-host.exe'),
  path.join('content', 'metadata', 'course_map.json'),
  path.join('content', 'metadata', 'exercises.json'),
  path.join('content', 'ai_tutor', 'prompting_basics.md'),
  path.join('content', 'ai_tutor', 'debug_dialogue.md'),
  path.join('content', 'ai_tutor', 'study_plan.md'),
  path.join('content', 'ai_tutor', 'socratic_review.md'),
  path.join('content', 'ai_tutor', 'agent_task_brief.md'),
  path.join('content', 'ai_tutor', 'tool_safety_checklist.md'),
  path.join('content', 'ai_tutor', 'workflow_retrospective.md'),
  path.join('content', 'ai_tutor', 'learning_log_automation.md'),
  path.join('demo', 'sample-problems.json'),
  path.join('demo', 'sample-chat-history.json'),
  path.join('demo', 'sample-knowledge', 'algorithm-patterns.md'),
  path.join('demo', 'sample-solutions', 'two-sum.py'),
  path.join('problems', 'leetcode.json'),
  path.join('resource-catalogs', 'community-cs-resources.json'),
  path.join('db', 'schema.sql'),
  path.join(
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  ),
]

const requiredAsarPaths = [
  'out/main/index.js',
  'out/main/codeRunnerUtility.js',
  'out/main/sqlRunnerUtility.js',
]

const countedDirs = [
  path.join('content', 'metadata'),
  path.join('content', 'ai_tutor'),
  path.join('content', 'python'),
  path.join('content', 'c'),
  path.join('content', 'cpp'),
  path.join('content', 'csharp'),
  path.join('content', 'database'),
  path.join('content', 'integration'),
  'demo',
  path.join('demo', 'sample-knowledge'),
  path.join('demo', 'sample-solutions'),
  'problems',
  'resource-catalogs',
  'db',
]

async function main() {
  const missing = requiredPaths.filter((relativePath) => {
    return !fs.existsSync(path.join(resourcesRoot, relativePath))
  })

  const asarPath = path.join(resourcesRoot, 'app.asar')
  const asarEntries = fs.existsSync(asarPath)
    ? new Set(
        listPackage(asarPath).map((entry) => entry.replace(/^[/\\]+/, '').replace(/\\/g, '/')),
      )
    : new Set()
  const missingAsarPaths = requiredAsarPaths.filter(
    (relativePath) => !asarEntries.has(relativePath),
  )

  function verifyX64PortableExecutable(relativePath) {
    const absolutePath = path.join(resourcesRoot, relativePath)
    if (!fs.existsSync(absolutePath)) return

    const file = fs.readFileSync(absolutePath)
    const peOffset = file.length >= 0x40 ? file.readUInt32LE(0x3c) : -1
    const hasPeHeader =
      peOffset >= 0 && peOffset + 6 <= file.length && file.readUInt32LE(peOffset) === 0x00004550
    const isX64 = hasPeHeader && file.readUInt16LE(peOffset + 4) === 0x8664
    if (file.length < 0x40 || file.readUInt16LE(0) !== 0x5a4d || !isX64) {
      console.error(`[verify-package] invalid x64 PE executable: ${relativePath}`)
      process.exit(1)
    }
  }

  console.log(`[verify-package] resources root: ${resourcesRoot}`)

  for (const relativePath of countedDirs) {
    const absolutePath = path.join(resourcesRoot, relativePath)
    if (!fs.existsSync(absolutePath)) {
      console.log(`[verify-package] missing directory: ${relativePath}`)
      continue
    }

    const entries = fs.readdirSync(absolutePath)
    console.log(`[verify-package] ${relativePath}: ${entries.length} entries`)
  }

  if (missing.length > 0) {
    console.error('[verify-package] missing required package resources:')
    for (const relativePath of missing) {
      console.error(`  - ${relativePath}`)
    }
    process.exit(1)
  }

  if (missingAsarPaths.length > 0) {
    console.error('[verify-package] missing required app.asar entries:')
    for (const relativePath of missingAsarPaths) {
      console.error(`  - ${relativePath}`)
    }
    process.exit(1)
  }

  const packagedMetadata = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'))
  const sourceMetadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  if (packagedMetadata.version !== sourceMetadata.version) {
    console.error(
      `[verify-package] app.asar version ${packagedMetadata.version} does not match package.json ${sourceMetadata.version}`,
    )
    process.exit(1)
  }

  verifyX64PortableExecutable(path.join('bin', 'win32-x64', 'codehelper-job-host.exe'))

  const executablePath = path.join(resourcesRoot, '..', 'CodeHelper.exe')
  if (!fs.existsSync(executablePath)) {
    console.error(`[verify-package] packaged executable is missing: ${executablePath}`)
    process.exit(1)
  }
  const fuseWire = await getCurrentFuseWire(executablePath)
  const expectedFuses = new Map([
    [FuseV1Options.RunAsNode, FUSE_DISABLED],
    [FuseV1Options.EnableCookieEncryption, FUSE_ENABLED],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FUSE_DISABLED],
    [FuseV1Options.EnableNodeCliInspectArguments, FUSE_DISABLED],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FUSE_ENABLED],
    [FuseV1Options.OnlyLoadAppFromAsar, FUSE_ENABLED],
  ])
  const invalidFuses = [...expectedFuses].filter(
    ([option, expected]) => fuseWire[option] !== expected,
  )
  if (invalidFuses.length > 0) {
    for (const [option, expected] of invalidFuses) {
      console.error(
        `[verify-package] invalid fuse ${FuseV1Options[option]}: expected ${expected}, got ${fuseWire[option]}`,
      )
    }
    process.exit(1)
  }

  console.log(
    `[verify-package] package resources, app version ${packagedMetadata.version}, and Electron Fuses are valid.`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})
