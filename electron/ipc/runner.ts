import { ipcMain } from 'electron'
import { runCodeSnippet } from '../utils/codeRunner'

export function registerRunnerIPC() {
  ipcMain.handle(
    'run-code',
    async (_event, args: { code: string; language: string; stdin?: string }) => {
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
      return runCodeSnippet(args.code, args.language, args.stdin)
    },
  )
}
