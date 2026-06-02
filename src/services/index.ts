/**
 * Service layer barrel export.
 *
 * Provides service interfaces that abstract IPC calls behind clean APIs.
 * This enables easier testing (mock services instead of IPC) and
 * clearer separation of concerns between UI and data access.
 *
 * Usage:
 * ```ts
 * import { problemService, chatService } from '../services'
 *
 * const problems = await problemService.list({ difficulty: 'easy' })
 * ```
 *
 * For testing, swap in mock implementations:
 * ```ts
 * import { setProblemService } from '../services'
 * setProblemService(createMockProblemService())
 * ```
 */

export { type IProblemService, problemService, setProblemService } from './problemService'

export { type IChatService, chatService, setChatService } from './chatService'

export { type ISettingsService, settingsService, setSettingsService } from './settingsService'

export { type IAIService, aiService, setAIService } from './aiService'

export { type IEditorService, editorService, setEditorService } from './editorService'
