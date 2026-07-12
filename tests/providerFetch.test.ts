import { beforeEach, describe, expect, it, vi } from 'vitest'

interface AgentOptionsState {
  connect?: {
    autoSelectFamily?: boolean
    autoSelectFamilyAttemptTimeout?: number
    lookup?: (
      hostname: string,
      options: { all?: boolean },
      callback: (...args: unknown[]) => void,
    ) => void
  }
}

const agentState = vi.hoisted(() => ({ options: null as AgentOptionsState | null }))

vi.mock('undici', () => ({
  Agent: class MockAgent {
    constructor(options: AgentOptionsState) {
      agentState.options = options
    }

    close() {
      return Promise.resolve()
    }
  },
}))

import { fetchAllowedProvider } from '../electron/utils/providerFetch'

describe('fetchAllowedProvider', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    agentState.options = null
  })

  it('pins the validated address in the dispatcher lookup', async () => {
    await fetchAllowedProvider(
      'https://provider.example/v1/models',
      { method: 'GET' },
      async () => [{ address: '93.184.216.34', family: 4 }],
    )

    const callback = vi.fn()
    agentState.options?.connect?.lookup?.('provider.example', {}, callback)
    const allCallback = vi.fn()
    agentState.options?.connect?.lookup?.('provider.example', { all: true }, allCallback)

    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4)
    expect(allCallback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.example/v1/models',
      expect.objectContaining({ method: 'GET', redirect: 'manual', dispatcher: expect.anything() }),
    )
  })

  it('keeps every vetted dual-stack address available for safe connection fallback', async () => {
    await fetchAllowedProvider('https://dual.example/v1/models', { method: 'GET' }, async () => [
      { address: '2001:4860:4860::8888', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ])

    const callback = vi.fn()
    agentState.options?.connect?.lookup?.('dual.example', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [
      { address: '2001:4860:4860::8888', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ])
    expect(agentState.options?.connect?.autoSelectFamily).toBe(true)
    expect(agentState.options?.connect?.autoSelectFamilyAttemptTimeout).toBe(250)
  })
})
