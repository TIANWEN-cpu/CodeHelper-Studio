import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'src/utils/**/*.ts',
        'src/types/**/*.ts',
        'src/constants/**/*.ts',
        'src/stores/**/*.ts',
        'src/hooks/**/*.ts',
        'src/api/**/*.ts',
        'src/services/**/*.ts',
        'electron/utils/**/*.ts',
        'electron/db/**/*.ts',
        'electron/ipc/**/*.ts',
      ],
      exclude: ['src/types/**/*.ts'],
      // 实测基线（2026-08-01，`npx vitest run --coverage`）：
      // statements 73.1% / branches 68.4% / functions 75.9% / lines 75.5%。
      // 阈值 = 实测值向下取整再减 1 作为防回归地板；后续随测试补充逐步上调。
      thresholds: {
        statements: 72,
        branches: 67,
        functions: 74,
        lines: 74,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
