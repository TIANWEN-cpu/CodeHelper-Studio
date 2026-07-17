/**
 * Real Electron E2E tests still need a BrowserWindow for Playwright, but must
 * not take focus from the developer running them. This switch is intentionally
 * test-only; normal application launches always show their windows.
 */
export const E2E_HEADLESS_ENV = 'CODEHELPER_E2E_HEADLESS'

export function shouldShowBrowserWindow(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment[E2E_HEADLESS_ENV] !== '1'
}
