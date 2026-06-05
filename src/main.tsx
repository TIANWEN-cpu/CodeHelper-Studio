import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

async function installBrowserPreviewMockIfNeeded() {
  const isDevHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  if (!isDevHost || window.api) return

  const { installDevBrowserApiMock } = await import('./devBrowserApiMock')
  installDevBrowserApiMock()
}

function renderFatalError(container: HTMLElement, message: string) {
  const fallback = document.createElement('div')
  fallback.style.color = 'red'
  fallback.style.padding = '20px'
  fallback.style.fontSize = '16px'
  fallback.textContent = message
  container.replaceChildren(fallback)
}

async function bootstrap() {
  if (import.meta.env.DEV) {
    await installBrowserPreviewMockIfNeeded()
  }

  // Catch and display any React mount errors
  const root = document.getElementById('root')
  if (!root) {
    renderFatalError(document.body, 'Error: #root element not found')
    return
  }

  try {
    createRoot(root).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (err) {
    console.error('[FATAL] React mount error:', err)
    renderFatalError(root, `React mount error: ${String(err)}`)
  }
}

void bootstrap()

// Global error handler
window.addEventListener('error', (e) => {
  console.error('[WINDOW ERROR]', e.error, e.message, e.filename, e.lineno)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED REJECTION]', e.reason)
})
