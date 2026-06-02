/**
 * Centralised Monaco Editor configuration.
 *
 * All editor options, default settings, and related constants live here
 * so that every MonacoEditor instance shares the same configuration.
 */

import type * as Monaco from 'monaco-editor'
import { useEditorStore, type EditorTab } from '../stores/editorStore'
import { useAppStore, type ThemeId } from '../stores/appStore'
import { monacoThemeByAppTheme, registerMonacoThemes } from '../theme/monacoThemes'
import { DEFAULT_EDITOR_FONT_SIZE, EDITOR_FONT_FAMILY, EDITOR_TAB_SIZE } from '../constants'

// ---------------------------------------------------------------------------
// Editor options (cached singleton to avoid repeated object allocation)
// ---------------------------------------------------------------------------

/** Minimap setting key */
const MINIMAP_KEY = 'codehelper-minimap-enabled'

/** Load minimap preference from localStorage */
export function getMinimapEnabled(): boolean {
  const v = localStorage.getItem(MINIMAP_KEY)
  if (v === null) return false // default off
  return v === 'true'
}

/** Save minimap preference to localStorage */
export function setMinimapEnabled(enabled: boolean): void {
  localStorage.setItem(MINIMAP_KEY, String(enabled))
}

// Cache the base editor options object (shared reference across renders)
let _cachedBaseOptions: Monaco.editor.IStandaloneEditorConstructionOptions | null = null

/** The default Monaco editor options shared across all instances. */
export function getDefaultEditorOptions(): Monaco.editor.IStandaloneEditorConstructionOptions {
  if (!_cachedBaseOptions) {
    _cachedBaseOptions = {
      fontSize: DEFAULT_EDITOR_FONT_SIZE,
      fontFamily: EDITOR_FONT_FAMILY,
      minimap: { enabled: getMinimapEnabled() },
      padding: { top: 12 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: EDITOR_TAB_SIZE,
      wordWrap: 'on',
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      // Performance: reduce unnecessary work
      renderWhitespace: 'none',
      folding: true,
      bracketPairColorization: { enabled: true },
      // Reduce overhead for large files
      largeFileOptimizations: true,
      // Smooth scrolling is preferred, but disable overscroll for better perf
      scrollBeyondLastColumn: 5,
    }
  }
  return _cachedBaseOptions
}

/** Invalidate the cached options (call when settings change). */
export function invalidateEditorOptionsCache() {
  _cachedBaseOptions = null
}

// ---------------------------------------------------------------------------
// Theme resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the Monaco theme name for the current application theme.
 */
export function resolveMonacoTheme(theme: ThemeId): string {
  return monacoThemeByAppTheme[theme]
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export { registerMonacoThemes, monacoThemeByAppTheme }

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Return the active editor tab via granular selectors to avoid re-rendering
 * on unrelated editorStore changes.
 */
export function useActiveTab(): EditorTab | null {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId) ?? null
  return tab
}

/**
 * Return the resolved Monaco theme name for the current app theme.
 */
export function useMonacoTheme(): string {
  const theme = useAppStore((state) => state.theme)
  return monacoThemeByAppTheme[theme]
}
