import { lazy, Suspense } from 'react'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { CommandPalette } from './CommandPalette'
import { ErrorBoundary } from './ErrorBoundary'
import { LoadingSpinner } from './LoadingSpinner'
import { useAppStore } from '../stores/appStore'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

// Lazy load all route-level views to reduce initial bundle size
// Each view is code-split into its own chunk
const EditorView = lazy(() =>
  import('../modules/editor/EditorView').then((m) => ({ default: m.EditorView })),
)
const SettingsView = lazy(() =>
  import('../modules/settings/SettingsView').then((m) => ({ default: m.SettingsView })),
)
const ChatView = lazy(() =>
  import('../modules/ai-chat/ChatView').then((m) => ({ default: m.ChatView })),
)
const ProblemsView = lazy(() =>
  import('../modules/problems/ProblemsView').then((m) => ({ default: m.ProblemsView })),
)
const MistakesView = lazy(() =>
  import('../modules/mistakes/MistakesView').then((m) => ({ default: m.MistakesView })),
)
const KnowledgeView = lazy(() =>
  import('../modules/knowledge/KnowledgeView').then((m) => ({ default: m.KnowledgeView })),
)
const StatsView = lazy(() =>
  import('../modules/stats/StatsView').then((m) => ({ default: m.StatsView })),
)
const GlobalSearchView = lazy(() =>
  import('../modules/search/GlobalSearchView').then((m) => ({ default: m.GlobalSearchView })),
)
const AnalyticsView = lazy(() =>
  import('../modules/analytics/AnalyticsView').then((m) => ({ default: m.AnalyticsView })),
)

// Lazy load non-essential overlay components
const GlobalSearch = lazy(() =>
  import('../modules/search/GlobalSearch').then((m) => ({ default: m.GlobalSearch })),
)

/** Minimal loading fallback for lazy-loaded views */
function ViewLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}

export function Layout() {
  const activeModule = useAppStore((s) => s.activeModule)

  // Register global keyboard shortcuts
  useKeyboardShortcuts()

  const renderModule = () => {
    switch (activeModule) {
      case 'problems':
        return (
          <ErrorBoundary section context="ProblemsView">
            <Suspense fallback={<ViewLoading />}>
              <ProblemsView />
            </Suspense>
          </ErrorBoundary>
        )
      case 'editor':
        return (
          <ErrorBoundary section context="EditorView">
            <Suspense fallback={<ViewLoading />}>
              <EditorView />
            </Suspense>
          </ErrorBoundary>
        )
      case 'settings':
        return (
          <ErrorBoundary section context="SettingsView">
            <Suspense fallback={<ViewLoading />}>
              <SettingsView />
            </Suspense>
          </ErrorBoundary>
        )
      case 'ai-chat':
        return (
          <ErrorBoundary section context="ChatView">
            <Suspense fallback={<ViewLoading />}>
              <ChatView />
            </Suspense>
          </ErrorBoundary>
        )
      case 'mistakes':
        return (
          <ErrorBoundary section context="MistakesView">
            <Suspense fallback={<ViewLoading />}>
              <MistakesView />
            </Suspense>
          </ErrorBoundary>
        )
      case 'knowledge':
        return (
          <ErrorBoundary section context="KnowledgeView">
            <Suspense fallback={<ViewLoading />}>
              <KnowledgeView />
            </Suspense>
          </ErrorBoundary>
        )
      case 'stats':
        return (
          <ErrorBoundary section context="StatsView">
            <Suspense fallback={<ViewLoading />}>
              <StatsView />
            </Suspense>
          </ErrorBoundary>
        )
      case 'search':
        return (
          <ErrorBoundary section context="GlobalSearchView">
            <Suspense fallback={<ViewLoading />}>
              <GlobalSearchView />
            </Suspense>
          </ErrorBoundary>
        )
      case 'analytics':
        return (
          <ErrorBoundary section context="AnalyticsView">
            <Suspense fallback={<ViewLoading />}>
              <AnalyticsView />
            </Suspense>
          </ErrorBoundary>
        )
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--theme-bg-app)] text-[var(--theme-text-primary)]">
      {/* Skip to content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10000] focus:rounded-lg focus:bg-[var(--theme-accent)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--theme-accent-contrast)] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] focus:ring-offset-2"
      >
        跳转到主内容
      </a>
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <nav aria-label="主导航">
          <Sidebar />
        </nav>
        <main
          id="main-content"
          className="flex-1 flex min-h-0 flex-col overflow-hidden"
          tabIndex={-1}
        >
          {renderModule()}
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
      <Suspense fallback={null}>
        <GlobalSearch />
      </Suspense>
    </div>
  )
}
