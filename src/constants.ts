export const IPC = {
  CHAT: 'ai-chat',
  CHAT_CHUNK: 'ai-chat-chunk',
  CHAT_DONE: 'ai-chat-done',
  RUN_CODE: 'run-code',
  PROBLEMS_LIST: 'problems-list',
  PROBLEMS_GET: 'problems-get',
  PROBLEMS_SUBMIT: 'problems-submit',
  KNOWLEDGE_LIST: 'knowledge-list',
  MISTAKES_LIST: 'mistakes-list',
  DB_GET_AI_CONFIGS: 'db-get-ai-configs',
  DB_SAVE_AI_CONFIG: 'db-save-ai-config',
  DB_DELETE_AI_CONFIG: 'db-delete-ai-config',
} as const

export const THEMES = ['mocha', 'fjord', 'ember'] as const
export const DEFAULT_THEME = 'mocha'
export const DEFAULT_LANGUAGE = 'python'
export const SESSION_TITLE_MAX_LENGTH = 60
export const DEFAULT_EDITOR_FONT_SIZE = 14
export const EDITOR_FONT_FAMILY = "'JetBrains Mono', monospace"
export const EDITOR_TAB_SIZE = 2

export const MODULE_LABELS = {
  problems: '刷题系统',
  editor: '代码编辑器',
  'ai-chat': 'AI 助手',
  mistakes: '错题本',
  knowledge: '知识库',
  settings: '设置',
} as const
