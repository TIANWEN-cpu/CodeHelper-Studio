import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { useEffect, lazy, Suspense } from 'react'
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

function App() {
  const loadTheme = useAppStore((state) => state.loadTheme)

  // Onboarding state
  const hydrated = useOnboardingStore((s) => s.hydrated)
  const wizardCompleted = useOnboardingStore((s) => s.wizardCompleted)
  const tourCompleted = useOnboardingStore((s) => s.tourCompleted)
  const hydrate = useOnboardingStore((s) => s.hydrate)

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

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Layout />
        {/* Onboarding overlays — only render after hydration */}
        {hydrated && (
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
