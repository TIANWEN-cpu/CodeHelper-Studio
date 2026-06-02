import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts')
        },
        external: ['electron', 'better-sqlite3']
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts')
        },
        external: ['electron']
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      },
      define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
