/**
 * GlobalSearchView — Full-page search module view.
 *
 * This is the sidebar-accessible search module. It launches the
 * GlobalSearch overlay automatically on mount and provides a
 * helpful placeholder when closed.
 */

import { useEffect } from 'react'
import { Search } from 'lucide-react'

export function GlobalSearchView() {
  // Auto-open the search overlay when this module is selected
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('codehelper:global-search'))
  }, [])

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <Search size={48} className="mx-auto mb-4 text-[var(--theme-text-muted)] opacity-30" />
        <p className="text-base font-medium text-[var(--theme-text-primary)]">全局搜索</p>
        <p className="mt-2 text-sm text-[var(--theme-text-muted)]">
          使用{' '}
          <kbd className="mx-1 rounded border border-[var(--theme-border)] bg-[var(--theme-bg-hover)] px-1.5 py-0.5 text-xs">
            Ctrl+Shift+F
          </kbd>{' '}
          打开搜索面板
        </p>
        <p className="mt-1 text-xs text-[var(--theme-text-muted)]">搜索题目、知识库、编辑器内容</p>
      </div>
    </div>
  )
}
