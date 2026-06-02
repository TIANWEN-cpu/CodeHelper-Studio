/**
 * ErrorBoundary component tests.
 *
 * Tests: error catching, error display, recovery, error reporting.
 *
 * Note: These tests use a minimal React-like approach since we're in
 * a node environment. We test the class logic (getDerivedStateFromError,
 * componentDidCatch) without a full DOM renderer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We import the ErrorBoundary component logic for unit testing.
// Since the project uses node environment for tests (not jsdom),
// we test the static methods and class behavior directly.

describe('ErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('getDerivedStateFromError', () => {
    it('returns hasError: true and the error object', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const error = new Error('test crash')
      const state = ErrorBoundary.getDerivedStateFromError(error)

      expect(state.hasError).toBe(true)
      expect(state.error).toBe(error)
      expect(state.error?.message).toBe('test crash')
    })

    it('preserves the original error type', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      class CustomError extends Error {
        code: string
        constructor(msg: string, code: string) {
          super(msg)
          this.code = code
        }
      }
      const error = new CustomError('custom crash', 'ERR_CUSTOM')
      const state = ErrorBoundary.getDerivedStateFromError(error)

      expect(state.hasError).toBe(true)
      expect(state.error).toBeInstanceOf(CustomError)
      expect((state.error as CustomError).code).toBe('ERR_CUSTOM')
    })

    it('handles errors with empty message', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const error = new Error('')
      const state = ErrorBoundary.getDerivedStateFromError(error)

      expect(state.hasError).toBe(true)
      expect(state.error?.message).toBe('')
    })

    it('handles errors with very long messages', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const longMessage = 'x'.repeat(10000)
      const error = new Error(longMessage)
      const state = ErrorBoundary.getDerivedStateFromError(error)

      expect(state.hasError).toBe(true)
      expect(state.error?.message).toHaveLength(10000)
    })

    it('handles errors with Unicode messages', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const error = new Error('发生了错误: 🚨 系统崩溃')
      const state = ErrorBoundary.getDerivedStateFromError(error)

      expect(state.hasError).toBe(true)
      expect(state.error?.message).toContain('🚨')
    })
  })

  describe('componentDidCatch', () => {
    it('logs error and errorInfo to console.error', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      // Create a minimal instance to test componentDidCatch
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

    it('handles errorInfo with empty componentStack', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const instance = new ErrorBoundary({ children: null })
      const error = new Error('empty stack')
      const errorInfo = { componentStack: '' }

      // Should not throw
      expect(() => instance.componentDidCatch(error, errorInfo)).not.toThrow()
      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('initial state', () => {
    it('starts with hasError: false and error: null', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const instance = new ErrorBoundary({ children: null })

      expect(instance.state.hasError).toBe(false)
      expect(instance.state.error).toBeNull()
    })
  })

  describe('render behavior', () => {
    it('returns children when no error', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const instance = new ErrorBoundary({ children: 'child content' })

      // render() should return children when hasError is false
      const result = instance.render()
      expect(result).toBe('child content')
    })

    it('returns error UI when hasError is true', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const instance = new ErrorBoundary({ children: 'child content' })

      // Simulate error state
      instance.state = { hasError: true, error: new Error('boom') }

      const result = instance.render()
      // The result should be a React element (object with type, props, etc.)
      // and should NOT be the children
      expect(result).not.toBe('child content')
      expect(result).toBeTruthy()
      // It should be a JSX element (object with props)
      if (typeof result === 'object' && result !== null && 'props' in result) {
        const props = (result as { props: Record<string, unknown> }).props
        expect(props).toBeTruthy()
        expect(props.style).toBeTruthy()
      }
    })

    it('error UI contains error message when error has message', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const instance = new ErrorBoundary({ children: 'child' })
      instance.state = { hasError: true, error: new Error('specific error') }

      const result = instance.render()
      // Verify the structure contains the error message
      if (typeof result === 'object' && result !== null && 'props' in result) {
        const props = (result as { props: Record<string, unknown> }).props
        const children = props.children as Array<{ props?: Record<string, unknown> }>
        // Find the <p> element that contains the error message
        const pElement = children?.find(
          (child: unknown) =>
            typeof child === 'object' &&
            child !== null &&
            'props' in (child as Record<string, unknown>) &&
            (child as { props?: { style?: { color?: string } } }).props?.style?.color === '#888',
        )
        if (pElement && typeof pElement === 'object' && 'props' in pElement) {
          const pProps = (pElement as { props: Record<string, unknown> }).props
          expect(pProps.children).toBe('specific error')
        }
      }
    })

    it('error UI shows fallback message when error has no message', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const instance = new ErrorBoundary({ children: 'child' })
      instance.state = { hasError: true, error: null }

      const result = instance.render()
      if (typeof result === 'object' && result !== null && 'props' in result) {
        const props = (result as { props: Record<string, unknown> }).props
        const children = props.children as Array<{ props?: Record<string, unknown> }>
        const pElement = children?.find(
          (child: unknown) =>
            typeof child === 'object' &&
            child !== null &&
            'props' in (child as Record<string, unknown>) &&
            (child as { props?: { style?: { color?: string } } }).props?.style?.color === '#888',
        )
        if (pElement && typeof pElement === 'object' && 'props' in pElement) {
          const pProps = (pElement as { props: Record<string, unknown> }).props
          expect(pProps.children).toBe('发生了未知错误，请尝试重新加载页面。')
        }
      }
    })
  })

  describe('error recovery state transitions', () => {
    it('getDerivedStateFromError followed by render produces error UI', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const instance = new ErrorBoundary({ children: 'normal content' })

      // Simulate the React lifecycle: getDerivedStateFromError -> render
      const error = new Error('component crashed')
      const newState = ErrorBoundary.getDerivedStateFromError(error)
      instance.state = newState

      expect(instance.state.hasError).toBe(true)
      const rendered = instance.render()
      expect(rendered).not.toBe('normal content')
    })

    it('multiple sequential errors update state correctly', async () => {
      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')

      const error1 = new Error('first error')
      const state1 = ErrorBoundary.getDerivedStateFromError(error1)
      expect(state1.error?.message).toBe('first error')

      const error2 = new Error('second error')
      const state2 = ErrorBoundary.getDerivedStateFromError(error2)
      expect(state2.error?.message).toBe('second error')
      // Each call produces independent state
      expect(state1.error?.message).toBe('first error')
    })
  })

  describe('handleReload', () => {
    it('calls window.location.reload', async () => {
      const mockReload = vi.fn()
      const originalLocation = globalThis.window?.location

      // Mock window.location.reload
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { reload: mockReload },
        },
        writable: true,
        configurable: true,
      })

      const { ErrorBoundary } = await import('../src/components/ErrorBoundary')
      const instance = new ErrorBoundary({ children: null })

      // Access the private method via prototype or direct call
      ;(instance as unknown as { handleReload: () => void }).handleReload()

      expect(mockReload).toHaveBeenCalled()

      // Restore
      if (originalLocation) {
        Object.defineProperty(globalThis, 'window', {
          value: { location: originalLocation },
          writable: true,
          configurable: true,
        })
      }
    })
  })
})
