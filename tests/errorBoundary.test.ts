import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const FALLBACK_MESSAGE = '应用遇到了意外错误，请尝试重新加载页面。如果问题持续存在，请重启应用。'

describe('ErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('derives error state from a thrown render error', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const error = new Error('render crash')

    const state = ErrorBoundary.getDerivedStateFromError(error)

    expect(state).toEqual({ hasError: true, error })
  })

  it('preserves custom error instances in derived state', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    class CustomError extends Error {
      code = 'ERR_CUSTOM'
    }
    const error = new CustomError('custom crash')

    const state = ErrorBoundary.getDerivedStateFromError(error)

    expect(state.error).toBeInstanceOf(CustomError)
    expect((state.error as CustomError).code).toBe('ERR_CUSTOM')
  })

  it('handles empty and very long error messages', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const emptyState = ErrorBoundary.getDerivedStateFromError(new Error(''))
    const longState = ErrorBoundary.getDerivedStateFromError(new Error('x'.repeat(10000)))

    expect(emptyState.error?.message).toBe('')
    expect(longState.error?.message).toHaveLength(10000)
  })

  it('preserves Unicode error messages in state', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const state = ErrorBoundary.getDerivedStateFromError(new Error('发生了错误 🚨'))

    expect(state.error?.message).toContain('🚨')
  })

  it('logs caught errors with component stack information', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const instance = new ErrorBoundary({ children: null })
    const error = new Error('render crash')
    const errorInfo = { componentStack: '\n    at Component\n    at App' }

    instance.componentDidCatch(error, errorInfo)

    expect(consoleSpy).toHaveBeenCalledWith(
      '[ErrorBoundary] ErrorBoundary caught:',
      error,
      errorInfo,
    )
  })

  it('does not throw when component stack information is empty', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const instance = new ErrorBoundary({ children: null })

    expect(() =>
      instance.componentDidCatch(new Error('empty stack'), { componentStack: '' }),
    ).not.toThrow()
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('renders children before an error is captured', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const instance = new ErrorBoundary({ children: 'child content' })

    expect(instance.render()).toBe('child content')
  })

  it('starts with a non-error state', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const instance = new ErrorBoundary({ children: null })

    expect(instance.state).toEqual({ hasError: false, error: null })
  })

  it('renders a stable fallback without leaking raw error text', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const instance = new ErrorBoundary({ children: 'child content' })
    instance.state = { hasError: true, error: new Error('<script>alert(1)</script>') }

    const result = instance.render()

    expect(result).toBeTruthy()
    expect(JSON.stringify(result)).toContain(FALLBACK_MESSAGE)
    expect(JSON.stringify(result)).toContain('应用出错了')
    expect(JSON.stringify(result)).toContain('重新加载')
    expect(JSON.stringify(result)).not.toContain('<script>alert(1)</script>')
  })

  it('renders the same fallback when error details are unavailable', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const instance = new ErrorBoundary({ children: 'child content' })
    instance.state = { hasError: true, error: null }

    expect(JSON.stringify(instance.render())).toContain(FALLBACK_MESSAGE)
  })

  it('renders fallback after applying derived error state', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const instance = new ErrorBoundary({ children: 'normal content' })
    instance.state = ErrorBoundary.getDerivedStateFromError(new Error('component crashed'))

    expect(instance.render()).not.toBe('normal content')
  })

  it('updates derived state independently for sequential errors', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')

    const first = ErrorBoundary.getDerivedStateFromError(new Error('first error'))
    const second = ErrorBoundary.getDerivedStateFromError(new Error('second error'))

    expect(first.error?.message).toBe('first error')
    expect(second.error?.message).toBe('second error')
  })

  it('offers a reload action from the fallback UI', async () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })

    const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
    const instance = new ErrorBoundary({ children: null })

    ;(instance as unknown as { handleReload: () => void }).handleReload()

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
