import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSystemCapabilities } from '../src/services/capabilityService'

describe('capability renderer service', () => {
  const invoke = vi.fn()

  beforeEach(() => {
    invoke.mockReset()
    vi.stubGlobal('window', { api: { invoke, on: vi.fn() } })
  })

  it('uses the allowlisted capability channel and preserves the refresh mode', async () => {
    invoke.mockResolvedValueOnce({ generatedAt: 123 })
    await expect(getSystemCapabilities(true)).resolves.toEqual({ generatedAt: 123 })
    expect(invoke).toHaveBeenCalledWith('system-capabilities-get', { force: true })
  })

  it('uses cached probes by default', async () => {
    invoke.mockResolvedValueOnce({ generatedAt: 124 })
    await getSystemCapabilities()
    expect(invoke).toHaveBeenCalledWith('system-capabilities-get', { force: false })
  })
})
