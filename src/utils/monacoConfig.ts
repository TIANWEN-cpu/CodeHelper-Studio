import { DEFAULT_EDITOR_FONT_SIZE, EDITOR_FONT_FAMILY, EDITOR_TAB_SIZE } from '@/constants'
import { monacoThemeByAppTheme } from '@/theme/monacoThemes'

const MINIMAP_KEY = 'codehelper-minimap-enabled'
let cachedOptions: Record<string, unknown> | null = null

export function getMinimapEnabled(): boolean {
  return localStorage.getItem(MINIMAP_KEY) === 'true'
}

export function setMinimapEnabled(enabled: boolean): void {
  localStorage.setItem(MINIMAP_KEY, String(enabled))
  invalidateEditorOptionsCache()
}

export function invalidateEditorOptionsCache(): void {
  cachedOptions = null
}

export function getDefaultEditorOptions(): Record<string, unknown> {
  if (cachedOptions) return cachedOptions
  cachedOptions = {
    fontSize: DEFAULT_EDITOR_FONT_SIZE,
    fontFamily: EDITOR_FONT_FAMILY,
    tabSize: EDITOR_TAB_SIZE,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    smoothScrolling: true,
    folding: true,
    minimap: { enabled: getMinimapEnabled() },
    bracketPairColorization: { enabled: true },
    largeFileOptimizations: true,
  }
  return cachedOptions
}

export function resolveMonacoTheme(appTheme: string): string {
  return monacoThemeByAppTheme[appTheme] ?? 'codehelper-dark'
}
