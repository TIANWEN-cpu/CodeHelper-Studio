// Verifies the unpacked Windows package includes runtime resources used by the app.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const resourcesRoot = process.env.CODEHELPER_PACKAGE_RESOURCES
  ? path.resolve(process.env.CODEHELPER_PACKAGE_RESOURCES)
  : path.join(root, 'dist-release', 'win-unpacked', 'resources')

const requiredPaths = [
  'app.asar',
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
  path.join('db', 'schema.sql'),
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
  'db',
]

const missing = requiredPaths.filter((relativePath) => {
  return !fs.existsSync(path.join(resourcesRoot, relativePath))
})

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

console.log('[verify-package] package resources are present.')
