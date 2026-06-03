import { join } from 'path'
import { existsSync } from 'fs'

export function getPreloadScriptPath(mainProcessDir: string): string {
  const preloadPath = join(mainProcessDir, '../preload/index.js')
  const exists = existsSync(preloadPath)
  if (!exists) {
    console.error(`[STARTUP][ERROR] Preload script NOT FOUND at: ${preloadPath}`)
  }
  return preloadPath
}
