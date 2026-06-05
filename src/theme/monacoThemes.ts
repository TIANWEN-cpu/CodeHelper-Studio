export const monacoThemeByAppTheme: Record<string, string> = {
  'midnight-ocean': 'codehelper-dark',
  'forest-green': 'codehelper-forest',
  'sunset-gold': 'codehelper-warm',
  'classic-light': 'vs',
  mocha: 'codehelper-dark',
  fjord: 'codehelper-forest',
  ember: 'codehelper-warm',
}

export function registerMonacoThemes(): void {
  // Monaco is optional in this build; themes are registered by the editor bundle when present.
}
