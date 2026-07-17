import { ipcMain } from 'electron'
import {
  detectToolchainsAsync,
  getIsolationInfo,
  runCodeSnippet,
  type CodeRunResult,
} from '../utils/codeRunner'
import type { ExecutionMode } from '../utils/toolchainDetect'

function getToolchains(force = false) {
  return detectToolchainsAsync(force)
}

export function registerRunnerIPC(): void {
  ipcMain.handle('runner-detect-toolchains', async (_event, args?: { force?: boolean }) => {
    const force = Boolean(args && typeof args === 'object' && args.force === true)
    const report = await getToolchains(force)
    return report
  })

  ipcMain.handle('runner-isolation-info', async () => getIsolationInfo())

  ipcMain.handle(
    'run-code',
    async (
      _event,
      args: { code: string; language: string; stdin?: string; executionMode?: ExecutionMode },
    ) => {
      if (!args || typeof args !== 'object') throw new Error('参数无效')
      if (typeof args.code !== 'string') throw new Error('参数无效: code')
      if (typeof args.language !== 'string' || !args.language.trim())
        throw new Error('参数无效: language')
      args.code = args.code.slice(0, 100000)
      args.language = args.language.trim().slice(0, 50)
      if (args.stdin !== undefined) {
        if (typeof args.stdin !== 'string') throw new Error('参数无效: stdin')
        args.stdin = args.stdin.slice(0, 100000)
      }
      if (
        args.executionMode !== undefined &&
        args.executionMode !== 'local-controlled' &&
        args.executionMode !== 'strong-isolation'
      ) {
        throw new Error('参数无效: executionMode')
      }
      const started = Date.now()
      const result: CodeRunResult =
        args.executionMode === undefined
          ? await runCodeSnippet(args.code, args.language, args.stdin)
          : await runCodeSnippet(args.code, args.language, args.stdin, args.executionMode)
      return {
        ...result,
        duration_ms: Date.now() - started,
      }
    },
  )
}
