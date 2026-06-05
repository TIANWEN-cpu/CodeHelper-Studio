import React from 'react'

type ErrorBoundaryProps = {
  children: React.ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

const FALLBACK_MESSAGE = '应用遇到了意外错误，请尝试重新加载页面。如果问题持续存在，请重启应用。'

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] ErrorBoundary caught:', error, errorInfo)
  }

  private handleReload(): void {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>应用出错了</h1>
        <p style={{ color: '#888', marginBottom: 16 }}>{FALLBACK_MESSAGE}</p>
        <button type="button" onClick={() => this.handleReload()} style={{ padding: '8px 12px' }}>
          重新加载
        </button>
      </div>
    )
  }
}
