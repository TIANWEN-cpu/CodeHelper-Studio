import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('electron-builder production resources', () => {
  it('packages runtime content needed by the packaged app', async () => {
    const config = await readFile(join(process.cwd(), 'electron-builder.yml'), 'utf8')

    function hasExtraResource(from: string, to: string) {
      return new RegExp(
        `-\\s+from:\\s+${escapeRegExp(from)}\\s*\\r?\\n\\s+to:\\s+${escapeRegExp(to)}\\b`,
      ).test(config)
    }

    expect(hasExtraResource('content', 'content')).toBe(true)
    expect(hasExtraResource('resources/demo', 'demo')).toBe(true)
    expect(hasExtraResource('resources/problems', 'problems')).toBe(true)
    expect(hasExtraResource('electron/db/schema.sql', 'db/schema.sql')).toBe(true)
  })

  it('uses the bounded NSIS UserProgramFiles copy from the pinned build tool', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>
    }
    const appBuilderPackage = JSON.parse(
      await readFile(join(process.cwd(), 'node_modules/app-builder-lib/package.json'), 'utf8'),
    ) as { version?: string }
    const multiUserTemplate = await readFile(
      join(process.cwd(), 'node_modules/app-builder-lib/templates/nsis/multiUser.nsh'),
      'utf8',
    )

    expect(packageJson.devDependencies?.['electron-builder']).toBe('26.15.3')
    expect(appBuilderPackage.version).toBe('26.15.3')
    expect(multiUserTemplate).toContain(
      "System::Call 'KERNEL32::lstrcpynW(w .r0, p r2, i ${NSIS_MAX_STRLEN})p'",
    )
    expect(multiUserTemplate).not.toContain("System::Call '*$2(&w${NSIS_MAX_STRLEN} .s)'")
  })
})
