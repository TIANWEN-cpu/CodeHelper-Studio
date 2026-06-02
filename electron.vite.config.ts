import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

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
      build: {
        rollupOptions: {
          input: resolve(__dirname, 'src/index.html'),
          output: {
            // Chunk splitting strategy for optimal caching and lazy loading
            manualChunks: {
              // Monaco editor is the heaviest dependency — isolate it
              'vendor-monaco': ['monaco-editor', '@monaco-editor/react'],
              // React core
              'vendor-react': ['react', 'react-dom'],
              // Markdown rendering (split from Monaco for independent loading)
              'vendor-markdown': ['react-markdown', 'react-syntax-highlighter', 'remark-gfm'],
              // State management
              'vendor-state': ['zustand'],
              // Icons (tree-shakeable named imports used across components)
              'vendor-icons': ['lucide-react'],
            },
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
