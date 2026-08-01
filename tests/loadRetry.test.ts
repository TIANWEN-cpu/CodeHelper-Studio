import { describe, expect, it } from 'vitest'
import {
  INITIAL_LOAD_RETRY_DELAY_MS,
  MAX_INITIAL_LOAD_RETRIES,
  shouldRetryLoad,
} from '../electron/utils/loadRetry'

describe('shouldRetryLoad', () => {
  it('allows retries while the observed failure count is below the maximum', () => {
    expect(shouldRetryLoad(0)).toBe(true)
    expect(shouldRetryLoad(MAX_INITIAL_LOAD_RETRIES - 1)).toBe(true)
  })

  it('stops retrying once the maximum number of retries has been used', () => {
    expect(shouldRetryLoad(MAX_INITIAL_LOAD_RETRIES)).toBe(false)
    expect(shouldRetryLoad(MAX_INITIAL_LOAD_RETRIES + 1)).toBe(false)
  })

  it('rejects negative or non-integer failure counts', () => {
    expect(shouldRetryLoad(-1)).toBe(false)
    expect(shouldRetryLoad(0.5)).toBe(false)
    expect(shouldRetryLoad(Number.NaN)).toBe(false)
  })

  it('exposes a fixed retry delay', () => {
    expect(INITIAL_LOAD_RETRY_DELAY_MS).toBe(500)
  })
})
