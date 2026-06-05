import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const DEFAULT_RENDERER_PORT = 5191
const rendererPort =
  Number(process.env.CODEHELPER_RENDERER_PORT || process.env.PORT || DEFAULT_RENDERER_PORT) ||
  DEFAULT_RENDERER_PORT

function rendererManualChunks(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/')
  if (!normalized.includes('/node_modules/')) return undefined

  if (
    normalized.includes('/node_modules/react/') ||
    normalized.includes('/node_modules/react-dom/')
  ) {
    return 'vendor-react'
  }
  if (
    normalized.includes('/node_modules/@uiw/react-codemirror/') ||
    normalized.includes('/node_modules/style-mod/') ||
    normalized.includes('/node_modules/w3c-keyname/') ||
    normalized.includes('/node_modules/crelt/')
  ) {
    return 'vendor-codemirror-core'
  }
  if (normalized.includes('/node_modules/thememirror/')) {
    return 'vendor-codemirror-themes'
  }
  if (
    normalized.includes('/node_modules/@codemirror/lang-') ||
    normalized.includes('/node_modules/@lezer/python/') ||
    normalized.includes('/node_modules/@lezer/javascript/') ||
    normalized.includes('/node_modules/@lezer/cpp/')
  ) {
    return 'vendor-codemirror-langs'
  }
  if (
    normalized.includes('/node_modules/@codemirror/') ||
    normalized.includes('/node_modules/@lezer/')
  ) {
    return 'vendor-codemirror-core'
  }
  if (normalized.includes('/node_modules/motion/')) return 'vendor-motion'
  if (normalized.includes('/node_modules/recharts/')) return 'vendor-charts'
  if (normalized.includes('/node_modules/lucide-react/')) return 'vendor-icons'
  if (normalized.includes('/node_modules/zustand/')) return 'vendor-state'
  return undefined
}

// Bundle analysis — enabled via `npm run build:analyze`
function resolveVisualizerPlugin() {
  const shouldAnalyze = process.env.ANALYZE === '1' || process.env.ANALYZE === 'true'
  if (!shouldAnalyze) return []
  return import('rollup-plugin-visualizer').then((mod) =>
    mod.visualizer({
      filename: resolve(__dirname, 'dist/bundle-stats.html'),
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  )
}

// @ts-expect-error -- electron-vite defineConfig overloads don't match async functions in strict mode
export default defineConfig(async () => {
  const visualizerPlugins = await resolveVisualizerPlugin()

  return {
    main: {
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'electron/main.ts'),
          },
          external: ['electron', 'better-sqlite3'],
        },
      },
      plugins: [externalizeDepsPlugin()],
    },
    preload: {
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'electron/preload.ts'),
          },
          external: ['electron'],
        },
      },
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
      root: 'src',
      server: rendererPort
        ? {
            port: rendererPort,
            strictPort: true,
          }
        : undefined,
      resolve: {
        alias: {
          '@': resolve(__dirname, 'src'),
        },
      },
      build: {
        rollupOptions: {
          input: resolve(__dirname, 'src/index.html'),
          output: {
            manualChunks: rendererManualChunks,
          },
        },
        // Enable tree-shaking (default in production, make it explicit)
        minify: 'esbuild',
        // Source maps for debugging production builds (set to false for smaller output)
        sourcemap: false,
        // Warn on chunk size over 500KB, error over 1MB
        chunkSizeWarningLimit: 500,
        // Target modern browsers (Chromium in Electron)
        target: 'esnext',
        // Enable CSS code splitting
        cssCodeSplit: true,
      },
      define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
      },
      plugins: [
        react(),
        tailwindcss(),
        ...(Array.isArray(visualizerPlugins) ? visualizerPlugins : []),
      ],
    },
  }
})
