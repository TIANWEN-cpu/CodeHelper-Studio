import React, { Suspense, lazy, useEffect } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { AlertTriangle, X } from 'lucide-react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { AITutorPanel } from './components/layout/AITutorPanel'
import { AIPet } from './components/AIPet'
import { ToastContainer } from './components/ToastContainer'
import { Spinner } from './components/ui'
import { registerToast } from './utils/errorHandler'
import { toast } from './stores/toastStore'
import { useEditorStore } from './stores/editorStore'
import { useAppStore } from './store'
import { useViewShortcuts } from './hooks/useViewShortcuts'
import { bindAppCloseLifecycle, registerAppCloseFlushHandler } from './services/appCloseLifecycle'
import {
  ensureEditorWorkspaceSync,
  flushEditorWorkspaceForClose,
} from './services/editorWorkspaceSync'
import {
  loadAppearance,
  applyAll,
  applyTheme,
  flushAppearanceWrites,
  resolveTheme,
  watchSystemTheme,
} from './lib/appearance'
import { getSetting, setSetting } from './services/settingsService'
import {
  DATABASE_RECOVERY_NOTICE_KEY,
  parseDatabaseRecoveryNotice,
  type DatabaseRecoveryNotice,
} from './shared/databaseRecoveryContract'

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
const AITutorView = lazy(() =>
  import('./views/AITutorView').then((module) => ({ default: module.AITutorView })),
)

// Loading Fallback
const ViewLoader = () => (
  <div className="w-full h-full flex flex-col items-center justify-center gap-4">
    <Spinner size="lg" className="text-[var(--color-accent-primary)]" />
    <span className="text-sm text-[var(--color-text-muted)] animate-pulse">正在加载工作区…</span>
  </div>
)

function useAppReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-reduce-motion') === 'true',
  )

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setReduced(root.getAttribute('data-reduce-motion') === 'true')
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-reduce-motion'] })
    sync()
    return () => observer.disconnect()
  }, [])

  return reduced
}

function App() {
  const currentView = useAppStore((state) => state.currentView)
  const showAITutor = useAppStore((state) => state.showAITutor)
  const setShowAITutor = useAppStore((state) => state.setShowAITutor)
  const reducedMotion = useAppReducedMotion()
  const [databaseRecoveryNotice, setDatabaseRecoveryNotice] =
    React.useState<DatabaseRecoveryNotice | null>(null)
  const [rendererRecoveryReason, setRendererRecoveryReason] = React.useState<string | null>(null)

  // Alt+1..8 快速切换主视图（与侧边栏顺序一致）。
  useViewShortcuts()

  // 把错误处理器的 toast 出口接到全局通知容器（此前 registerToast 从未被调用）。
  useEffect(() => {
    registerToast((_type, message) => toast.error(message))
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    const reason = url.searchParams.get('rendererRecovery')
    if (!reason) return
    setRendererRecoveryReason(reason)
    url.searchParams.delete('rendererRecovery')
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])

  useEffect(() => {
    let cancelled = false
    void getSetting(DATABASE_RECOVERY_NOTICE_KEY)
      .then((value) => {
        if (!cancelled) setDatabaseRecoveryNotice(parseDatabaseRecoveryNotice(value))
      })
      .catch((error) => {
        console.error('[STARTUP] Failed to read database recovery notice:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const acknowledgeDatabaseRecovery = async () => {
    try {
      await setSetting(DATABASE_RECOVERY_NOTICE_KEY, '')
      setDatabaseRecoveryNotice(null)
    } catch {
      toast.error('无法关闭数据库恢复提示，请稍后重试')
    }
  }

  useEffect(() => {
    // Restore before starting the application-scoped synchronizer so direct entry into
    // practice still preserves the workspace topology. Both operations are idempotent
    // when React StrictMode replays this effect during development.
    useEditorStore.getState().restoreTabs()
    void ensureEditorWorkspaceSync()

    const unregisterWorkspace = registerAppCloseFlushHandler('editor-workspace', async () => {
      const result = await flushEditorWorkspaceForClose()
      if (result.durability === 'database') return { ok: true }
      return {
        ok: false,
        recoveryAvailable: result.durability === 'recovery',
        error:
          result.durability === 'recovery'
            ? `编辑器未完成 SQLite 同步；最新内容已保存在本地恢复区${result.error ? `：${result.error}` : ''}`
            : result.error || '编辑器工作区仍有内容未完成持久化',
      }
    })
    const unregisterAppearance = registerAppCloseFlushHandler('appearance-settings', async () => {
      await flushAppearanceWrites()
      return { ok: true }
    })
    const unbindCloseLifecycle = bindAppCloseLifecycle()
    return () => {
      unbindCloseLifecycle()
      unregisterAppearance()
      unregisterWorkspace()
    }
  }, [])

  // 启动时从数据库读回外观设置并应用到 DOM；"跟随系统"时监听系统主题变化。
  useEffect(() => {
    let cancelled = false
    let unwatch = () => {}
    loadAppearance().then((a) => {
      if (cancelled) return
      applyAll(a)
      useAppStore.getState().hydrateTheme(resolveTheme(a.theme, a.followSystem))
      useAppStore.getState().hydrateAppearanceControls({
        visualTheme: a.visualTheme,
        backgroundStyle: a.backgroundStyle,
        animationLevel: a.animationLevel,
        glassStyle: a.glassStyle,
        glassBlur: a.glassBlur,
        aiPetEnabled: a.aiPetEnabled,
        aiPetSize: a.aiPetSize,
      })
      if (a.followSystem) {
        unwatch = watchSystemTheme((sysTheme) => {
          applyTheme(sysTheme)
          useAppStore.getState().hydrateTheme(sysTheme)
        })
      }
    })
    // 读回布局偏好（AI 面板 / 侧边栏折叠 / 底部面板 / 标签换行）。
    useAppStore.getState().hydrateLayout()
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
      case 'ai-tutor':
        view = <AITutorView />
        break
      default:
        view = <HomeView />
    }
    return <Suspense fallback={<ViewLoader />}>{view}</Suspense>
  }

  const hideHeader = currentView === 'workspace' || currentView === 'practice'

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      <div className="app-shell flex h-screen w-full text-[var(--color-text-primary)] overflow-hidden font-sans">
        <div className="app-ambient-layer" aria-hidden="true" />
        <Sidebar />

        <div className="relative z-10 flex-1 flex flex-col min-w-0">
          {rendererRecoveryReason && (
            <div
              role="status"
              data-testid="renderer-recovery-banner"
              className="flex shrink-0 items-start gap-3 border-b border-[var(--color-accent-warning)]/40 bg-[var(--color-accent-warning)]/10 px-4 py-2.5"
            >
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-[var(--color-accent-warning)]"
              />
              <div className="min-w-0 flex-1 text-xs leading-relaxed">
                <p className="font-semibold text-[var(--color-text-primary)]">
                  界面进程异常退出，CodeHelper 已自动重新加载
                </p>
                <p className="mt-0.5 text-[var(--color-text-secondary)]">
                  正在从 SQLite
                  与本地恢复区核对工作区。请确认状态栏显示已保存；若显示降级，请先保留恢复数据再重试。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRendererRecoveryReason(null)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                aria-label="关闭界面恢复提示"
                title="关闭提示"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {databaseRecoveryNotice && (
            <div
              role="status"
              data-testid="database-recovery-banner"
              className="flex shrink-0 items-start gap-3 border-b border-[var(--color-accent-warning)]/40 bg-[var(--color-accent-warning)]/10 px-4 py-2.5"
            >
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-[var(--color-accent-warning)]"
              />
              <div className="min-w-0 flex-1 text-xs leading-relaxed">
                <p className="font-semibold text-[var(--color-text-primary)]">
                  数据库损坏已隔离，当前已使用新数据库启动
                </p>
                <p className="mt-0.5 text-[var(--color-text-secondary)]">
                  编辑器会从本地恢复区尝试恢复；其他原始数据仍保存在：
                  <span className="ml-1 break-all font-mono text-[var(--color-accent-warning)]">
                    {databaseRecoveryNotice.backupPath}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void acknowledgeDatabaseRecovery()}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                aria-label="关闭数据库恢复提示"
                title="关闭提示"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {!hideHeader && <Header />}
          <main className="app-main flex-1 overflow-hidden relative">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
              className="w-full h-full flex flex-col pt-1"
            >
              {renderView()}
            </motion.div>
          </main>
        </div>

        {showAITutor && <AITutorPanel onClose={() => setShowAITutor(false)} />}
        <AIPet />
        <ToastContainer />
      </div>
    </MotionConfig>
  )
}

export default App
