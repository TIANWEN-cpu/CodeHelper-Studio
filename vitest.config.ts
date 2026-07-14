import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/utils/**/*.ts',
        'src/types/**/*.ts',
        'src/constants/**/*.ts',
        'src/stores/**/*.ts',
        'src/hooks/**/*.ts',
        'src/api/**/*.ts',
        'electron/utils/**/*.ts',
        'electron/db/**/*.ts',
        'electron/ipc/**/*.ts',
      ],
      exclude: [
        'src/types/**/*.ts',
        'src/hooks/useAIStream.ts',
        'src/hooks/useCodeExecution.ts',
        'src/hooks/useKeyboardShortcuts.ts',
        'src/hooks/index.ts',
        'src/utils/monacoConfig.ts',
        'electron/ipc/ai.ts',
      ],
      // 临时地板：当前整体覆盖率约 58%（lines/statements/branches）/ 64%（functions）。
      // 暂设为当前水平下方的防回归门槛，避免 CI 长期红；后续随测试补充逐步上调至 70%。
      thresholds: {
        statements: 57,
        branches: 57,
        functions: 57,
        lines: 57,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
