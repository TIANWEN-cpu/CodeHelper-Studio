import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../utils/errorHandler'

interface Props {
  children: ReactNode
  /**
   * When true, renders a compact section-level error UI instead of
   * the default full-page error screen.
   */
  section?: boolean
  /** Optional context label passed to error reporting. */
  context?: string
  /** Optional fallback element to render on error instead of the default UI. */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const context = this.props.context ?? 'ErrorBoundary'
    reportError(error, context, { showToast: false })
    console.error(`[${context}] ErrorBoundary caught:`, error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      if (this.props.section) {
        return (
          <div role="alert" className="flex flex-col items-center justify-center p-8 text-center">
            <p className="text-base font-semibold text-[var(--theme-text-primary)]">组件加载出错</p>
            <p className="mt-2 max-w-xs text-sm text-[var(--theme-text-muted)]">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button onClick={this.handleReset} className="ui-btn-accent mt-4 px-4 py-2 text-sm">
              重试
            </button>
          </div>
        )
      }

      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>页面出错了</h1>
          <p style={{ color: '#888', marginBottom: '1.5rem', maxWidth: '28rem' }}>
            {this.state.error?.message || '发生了未知错误，请尝试重新加载页面。'}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '0.5rem 1.5rem',
              fontSize: '1rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: '#1677ff',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
