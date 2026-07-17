import { describe, expect, it } from 'vitest'
import {
  createBootScopedRecoverySessionId,
  recoveryKeyBootScope,
  recoverySessionBootScope,
} from '../src/utils/recoverySession'

describe('recovery renderer session scope', () => {
  it('round-trips a normalized app boot scope through a recovery key', () => {
    const sessionId = createBootScopedRecoverySessionId('window/a', 'boot:a')

    expect(sessionId).toBe('boot-boot-a--renderer-window-a')
    expect(recoverySessionBootScope(sessionId)).toBe('boot-a')
    expect(recoveryKeyBootScope(`recovery.session.${sessionId}`, 'recovery.session.')).toBe(
      'boot-a',
    )
  })

  it('treats pre-boot-scope session ids as legacy', () => {
    expect(recoverySessionBootScope('legacy-window-a')).toBeNull()
    expect(recoveryKeyBootScope('recovery.session.legacy-window-a', 'recovery.session.')).toBeNull()
  })
})
