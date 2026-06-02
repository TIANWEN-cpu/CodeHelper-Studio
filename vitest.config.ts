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
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
