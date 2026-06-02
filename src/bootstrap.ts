/**
 * Application DI bootstrap — registers all services into the container.
 *
 * Call `bootstrapServices()` once at application startup (in main.tsx)
 * before rendering the React tree.
 *
 * Usage:
 * ```ts
 * // main.tsx
 * import { bootstrapServices } from './bootstrap'
 * bootstrapServices()
 * ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
 * ```
 */

import { container } from './utils/di'
import { eventBus } from './utils/eventBus'
import { problemService } from './services/problemService'
import { chatService } from './services/chatService'
import { settingsService } from './services/settingsService'
import { aiService } from './services/aiService'
import { editorService } from './services/editorService'

/**
 * Register all core services and singletons into the DI container.
 * Safe to call multiple times (idempotent for already-registered keys).
 */
export function bootstrapServices(): void {
  // Event bus — already a singleton, just register it for DI resolution
  if (!container.has('eventBus')) {
    container.registerInstance('eventBus', eventBus)
  }

  // Services — register instances for DI resolution
  if (!container.has('problemService')) {
    container.registerInstance('problemService', problemService)
  }
  if (!container.has('chatService')) {
    container.registerInstance('chatService', chatService)
  }
  if (!container.has('settingsService')) {
    container.registerInstance('settingsService', settingsService)
  }
  if (!container.has('aiService')) {
    container.registerInstance('aiService', aiService)
  }
  if (!container.has('editorService')) {
    container.registerInstance('editorService', editorService)
  }

  console.log('[Bootstrap] Services registered:', container.keys().join(', '))
}
