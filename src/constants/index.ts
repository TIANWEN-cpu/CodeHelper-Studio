/**
 * Shared constants for the CodeHelper application.
 *
 * IPC channel names, default settings, and other magic strings
 * that are used across the renderer process.
 */

// ---------------------------------------------------------------------------
// IPC Channels — keep in sync with electron/ipc/*.ts
// ---------------------------------------------------------------------------

/** Chat-related IPC channels. */
export const IPC = {
  CHAT: 'ai-chat',
  CHAT_CHUNK: 'ai-chat-chunk',
  CHAT_DONE: 'ai-chat-done',
  CHAT_SESSION_CREATE: 'chat-session-create',
  CHAT_SESSION_DELETE: 'chat-session-delete',
  CHAT_SESSION_UPDATE: 'chat-session-update',
  CHAT_SESSIONS_LIST: 'chat-sessions-list',
  CHAT_MESSAGES_LOAD: 'chat-messages-load',
  CHAT_MESSAGE_SAVE: 'chat-message-save',
  CHAT_PRESETS_LIST: 'chat-presets-list',
  CHAT_MEMORIES_LIST: 'chat-memories-list',
  CHAT_MEMORY_SAVE: 'chat-memory-save',
  CHAT_MEMORY_DELETE: 'chat-memory-delete',
  CHAT_MEMORY_CAPTURE: 'chat-memory-capture',
  CHAT_PRESET_SAVE: 'chat-preset-save',
  CHAT_PRESET_DELETE: 'chat-preset-delete',

  /** AI model fetching. */
  AI_FETCH_MODELS: 'ai-fetch-models',

  /** External links. */
  OPEN_EXTERNAL: 'open-external',

  /** Code execution. */
  RUN_CODE: 'run-code',

  /** Platform information. */
  PLATFORM_INFO: 'platform-info',

  /** Problem module. */
  PROBLEMS_LIST: 'problems-list',
  PROBLEMS_GET: 'problems-get',
  PROBLEMS_SUBMIT: 'problems-submit',

  /** Knowledge module. */
  KNOWLEDGE_LIST: 'knowledge-list',
  KNOWLEDGE_UPLOAD: 'knowledge-upload',
  KNOWLEDGE_SEARCH: 'knowledge-search',
  KNOWLEDGE_DELETE: 'knowledge-delete',
  KNOWLEDGE_SEMANTIC_SEARCH: 'knowledge-semantic-search',
  KNOWLEDGE_SUMMARIZE: 'knowledge-summarize',
  KNOWLEDGE_CONCEPT_GRAPH: 'knowledge-concept-graph',
  KNOWLEDGE_CONCEPT_DETAIL: 'knowledge-concept-detail',
  KNOWLEDGE_AUTO_TAG: 'knowledge-auto-tag',
  KNOWLEDGE_TAGS: 'knowledge-tags',
  KNOWLEDGE_TAG_DOCUMENTS: 'knowledge-tag-documents',
  KNOWLEDGE_RAG_CONTEXT: 'knowledge-rag-context',

  /** Mistake module. */
  MISTAKES_LIST: 'mistakes-list',
  MISTAKES_UPDATE_ANALYSIS: 'mistakes-update-analysis',
  MISTAKES_DELETE: 'mistakes-delete',

  /** Settings. */
  DB_GET_AI_CONFIGS: 'db-get-ai-configs',
  DB_SAVE_AI_CONFIG: 'db-save-ai-config',
  DB_DELETE_AI_CONFIG: 'db-delete-ai-config',
  DB_GET_SETTING: 'db-get-setting',
  DB_SET_SETTING: 'db-set-setting',
} as const

// ---------------------------------------------------------------------------
// App defaults
// ---------------------------------------------------------------------------

/** Available themes in the application. */
export const THEMES = ['mocha', 'fjord', 'ember'] as const

/** Default theme id. */
export const DEFAULT_THEME = 'mocha' as const

/** Default font size for Monaco editor. */
export const DEFAULT_EDITOR_FONT_SIZE = 14

/** Monaco editor font family — includes cross-platform fallbacks. */
export const EDITOR_FONT_FAMILY =
  "'Cascadia Code', 'Fira Code', Menlo, Monaco, 'DejaVu Sans Mono', Consolas, monospace"

/** Default tab size in spaces. */
export const EDITOR_TAB_SIZE = 4

/** Default language for the code editor. */
export const DEFAULT_LANGUAGE = 'python'

/** Max characters for auto-generated session titles. */
export const SESSION_TITLE_MAX_LENGTH = 30

/** Theme setting key in the database. */
export const THEME_SETTING_KEY = 'ui-theme'

/** Module labels for the status bar and other UI elements. */
export const MODULE_LABELS: Record<string, string> = {
  problems: '刷题系统',
  editor: '代码编辑器',
  'ai-chat': 'AI 助手',
  mistakes: '错题本',
  knowledge: '知识库',
  settings: '设置',
  stats: '统计面板',
  search: '全局搜索',
  analytics: '分析面板',
  help: '帮助中心',
}
