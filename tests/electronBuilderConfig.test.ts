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
})
