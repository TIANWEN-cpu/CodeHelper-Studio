import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
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
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            页面出错了
          </h1>
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
