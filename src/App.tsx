import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { useEffect, lazy, Suspense, useState, useRef } from 'react'
import { useAppStore } from './stores/appStore'
import { useOnboardingStore } from './modules/onboarding'
import { startMemoryMonitor, stopMemoryMonitor } from './utils/memoryMonitor'

// Lazy load onboarding components — they are only needed on first run
const WelcomeWizard = lazy(() =>
  import('./modules/onboarding').then((m) => ({ default: m.WelcomeWizard })),
)
const FeatureTour = lazy(() =>
  import('./modules/onboarding').then((m) => ({ default: m.FeatureTour })),
)
const SetupChecklist = lazy(() =>
  import('./modules/onboarding').then((m) => ({ default: m.SetupChecklist })),
)

// ---------------------------------------------------------------------------
// Initialization timeout — if IPC calls hang, the user should still see the app
// ---------------------------------------------------------------------------

const INIT_TIMEOUT_MS = 5000

function App() {
  const loadTheme = useAppStore((state) => state.loadTheme)

  // Onboarding state
  const hydrated = useOnboardingStore((s) => s.hydrated)
  const wizardCompleted = useOnboardingStore((s) => s.wizardCompleted)
  const tourCompleted = useOnboardingStore((s) => s.tourCompleted)
  const hydrate = useOnboardingStore((s) => s.hydrate)

  // Track whether initialization has completed (or timed out)
  const [initReady, setInitReady] = useState(false)
  const initTimedOut = useRef(false)

  useEffect(() => {
    void loadTheme()
  }, [loadTheme])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Start renderer memory monitoring on mount
  useEffect(() => {
    startMemoryMonitor()
    return () => stopMemoryMonitor()
  }, [])

  // Safety net: if hydration never resolves (IPC hang), allow the UI to render
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!initTimedOut.current) {
        initTimedOut.current = true
        console.warn(
          '[CodeHelper] Init timed out after ' + INIT_TIMEOUT_MS + 'ms — rendering UI anyway',
        )
        setInitReady(true)
      }
    }, INIT_TIMEOUT_MS)

    return () => clearTimeout(timer)
  }, [])

  // Mark ready once hydrated completes normally
  useEffect(() => {
    if (hydrated && !initTimedOut.current) {
      setInitReady(true)
    }
  }, [hydrated])

  return (
    <ErrorBoundary>
      <ToastProvider>
        {/* Always render the main layout immediately — don't block on async init */}
        <Layout />
        {/* Onboarding overlays — only render after hydration (or timeout) */}
        {initReady && (
          <Suspense fallback={null}>
            {!wizardCompleted && <WelcomeWizard />}
            {wizardCompleted && !tourCompleted && <FeatureTour />}
            {wizardCompleted && <SetupChecklist />}
          </Suspense>
        )}
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
