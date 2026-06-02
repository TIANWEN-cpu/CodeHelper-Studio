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
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
