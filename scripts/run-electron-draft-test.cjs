/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const workspace = path.resolve(__dirname, '..')
const vitestCli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const result = spawnSync(
  process.execPath,
  [vitestCli, 'run', 'tests/exerciseDraftElectron.test.ts'],
  {
    cwd: workspace,
    env: { ...process.env, CODEHELPER_ELECTRON_E2E: '1' },
    stdio: 'inherit',
    windowsHide: true,
  },
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
