/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const electronPath = require('electron')
const result = spawnSync(
  electronPath,
  [path.join(__dirname, 'verify-database-recovery-electron.cjs')],
  {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    windowsHide: true,
  },
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
