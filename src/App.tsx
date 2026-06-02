import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'

function App() {
  const loadTheme = useAppStore((state) => state.loadTheme)

  useEffect(() => {
    void loadTheme()
  }, [loadTheme])

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Layout />
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
