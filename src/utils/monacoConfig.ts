/**
 * Centralised Monaco Editor configuration.
 *
 * All editor options, default settings, and related constants live here
 * so that every MonacoEditor instance shares the same configuration.
 */

import type * as Monaco from 'monaco-editor'
import { useEditorStore } from '../stores/editorStore'
import { useAppStore, type ThemeId } from '../stores/appStore'
import { monacoThemeByAppTheme, registerMonacoThemes } from '../theme/monacoThemes'
import { DEFAULT_EDITOR_FONT_SIZE, EDITOR_FONT_FAMILY, EDITOR_TAB_SIZE } from '../constants'

// ---------------------------------------------------------------------------
// Editor options
// ---------------------------------------------------------------------------

/** The default Monaco editor options shared across all instances. */
export const defaultEditorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  fontSize: DEFAULT_EDITOR_FONT_SIZE,
  fontFamily: EDITOR_FONT_FAMILY,
  minimap: { enabled: false },
  padding: { top: 12 },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: EDITOR_TAB_SIZE,
  wordWrap: 'on',
  renderLineHighlight: 'line',
  cursorBlinking: 'smooth',
  smoothScrolling: true,
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
 * Return the active editor tab and common editor props for Monaco.
 *
 * This hook eliminates the duplicated `tabs.find(t => t.id === activeTabId)`
 * pattern in MonacoEditor and EditorView.
 */
export function useActiveTab() {
  const { tabs, activeTabId } = useEditorStore()
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
