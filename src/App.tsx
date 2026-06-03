import React, { Suspense, lazy, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { AITutorPanel } from './components/layout/AITutorPanel'
import { useAppStore } from './store'
import {
  loadAppearance,
  applyAll,
  applyTheme,
  resolveTheme,
  watchSystemTheme,
} from './lib/appearance'

// Lazy Loaded Views for better initial bundle size
const HomeView = lazy(() =>
  import('./views/HomeView').then((module) => ({ default: module.HomeView })),
)
const WorkspaceView = lazy(() =>
  import('./views/WorkspaceView').then((module) => ({ default: module.WorkspaceView })),
)
const SettingsView = lazy(() =>
  import('./views/SettingsView').then((module) => ({ default: module.SettingsView })),
)
const KnowledgeView = lazy(() =>
  import('./views/KnowledgeView').then((module) => ({ default: module.KnowledgeView })),
)
const ReviewView = lazy(() =>
  import('./views/ReviewView').then((module) => ({ default: module.ReviewView })),
)
const LearnView = lazy(() =>
  import('./views/LearnView').then((module) => ({ default: module.LearnView })),
)
const PracticeView = lazy(() =>
  import('./views/PracticeView').then((module) => ({ default: module.PracticeView })),
)
const ProfileView = lazy(() =>
  import('./views/ProfileView').then((module) => ({ default: module.ProfileView })),
)

// Loading Fallback
const ViewLoader = () => (
  <div className="w-full h-full flex flex-col items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-[var(--color-border-subtle)] border-t-[var(--color-accent-primary)] animate-spin mb-4" />
    <span className="text-sm text-[var(--color-text-muted)] animate-pulse">
      Loading workspace...
    </span>
  </div>
)

function App() {
  const { currentView, showAITutor, setShowAITutor } = useAppStore()

  // 启动时从数据库读回外观设置并应用到 DOM；"跟随系统"时监听系统主题变化。
  useEffect(() => {
    let cancelled = false
    let unwatch = () => {}
    loadAppearance().then((a) => {
      if (cancelled) return
      applyAll(a)
      useAppStore.getState().hydrateTheme(resolveTheme(a.theme, a.followSystem))
      if (a.followSystem) {
        unwatch = watchSystemTheme((sysTheme) => {
          applyTheme(sysTheme)
          useAppStore.getState().hydrateTheme(sysTheme)
        })
      }
    })
    return () => {
      cancelled = true
      unwatch()
    }
  }, [])

  // Render main content based on view
  const renderView = () => {
    let view
    switch (currentView) {
      case 'home':
        view = <HomeView />
        break
      case 'workspace':
        view = <WorkspaceView />
        break
      case 'knowledge':
        view = <KnowledgeView />
        break
      case 'settings':
        view = <SettingsView />
        break
      case 'review':
        view = <ReviewView />
        break
      case 'learn':
        view = <LearnView />
        break
      case 'practice':
        view = <PracticeView />
        break
      case 'profile':
        view = <ProfileView />
        break
      default:
        view = <HomeView />
    }
    return <Suspense fallback={<ViewLoader />}>{view}</Suspense>
  }

  const hideHeader = currentView === 'workspace' || currentView === 'practice'

  return (
    <div className="flex h-screen w-full bg-[var(--color-bg-base)] text-[var(--color-text-primary)] overflow-hidden font-sans">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {!hideHeader && <Header />}
        <main className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="w-full h-full flex flex-col pt-1"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {showAITutor && <AITutorPanel onClose={() => setShowAITutor(false)} />}
      </AnimatePresence>
    </div>
  )
}

export default App
