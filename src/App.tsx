import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'

function App() {
  const loadTheme = useAppStore((state) => state.loadTheme)

  useEffect(() => {
    void loadTheme()
  }, [loadTheme])

  return (
    <ErrorBoundary>
      <Layout />
    </ErrorBoundary>
  )
}

export default App
