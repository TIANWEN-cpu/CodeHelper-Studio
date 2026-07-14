import { spawnSync } from 'child_process'
import { createRequire } from 'module'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe.runIf(process.env.CODEHELPER_ELECTRON_E2E === '1')(
  'exercise drafts in the real Electron runtime',
  () => {
    it('migrates, persists, rejects stale writes, and preserves tombstones', () => {
      const electronPath = require('electron') as string
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const result = spawnSync(
        electronPath,
        [join(process.cwd(), 'scripts', 'verify-exercise-drafts-electron.cjs')],
        {
          cwd: process.cwd(),
          env,
          encoding: 'utf8',
          timeout: 30_000,
          windowsHide: true,
        },
      )

      expect(result.error).toBeUndefined()
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(result.stdout).toContain('DRAFT_ELECTRON_E2E_OK')
    })
  },
)
