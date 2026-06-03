import { join } from 'path'

export function getPreloadScriptPath(mainProcessDir: string): string {
  return join(mainProcessDir, '../preload/index.js')
}
