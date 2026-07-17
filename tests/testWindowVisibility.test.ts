import { describe, expect, it } from 'vitest'
import { E2E_HEADLESS_ENV, shouldShowBrowserWindow } from '../electron/utils/testWindowVisibility'

describe('test window visibility', () => {
  it('keeps normal application windows visible', () => {
    expect(shouldShowBrowserWindow({})).toBe(true)
  })

  it('hides BrowserWindow instances only for the explicit E2E environment', () => {
    expect(shouldShowBrowserWindow({ [E2E_HEADLESS_ENV]: '1' })).toBe(false)
    expect(shouldShowBrowserWindow({ [E2E_HEADLESS_ENV]: 'true' })).toBe(true)
  })
})
