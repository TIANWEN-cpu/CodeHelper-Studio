import { describe, it, expect } from 'vitest'
import {
  IPC,
  THEMES,
  DEFAULT_THEME,
  DEFAULT_LANGUAGE,
  MODULE_LABELS,
  SESSION_TITLE_MAX_LENGTH,
} from '../src/constants'

describe('IPC constants', () => {
  it('所有 IPC 通道名称都是字符串', () => {
    for (const [_key, value] of Object.entries(IPC)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it('关键通道存在', () => {
    expect(IPC.CHAT).toBe('ai-chat')
    expect(IPC.CHAT_CHUNK).toBe('ai-chat-chunk')
    expect(IPC.CHAT_DONE).toBe('ai-chat-done')
    expect(IPC.RUN_CODE).toBe('run-code')
    expect(IPC.PROBLEMS_LIST).toBe('problems-list')
    expect(IPC.KNOWLEDGE_LIST).toBe('knowledge-list')
    expect(IPC.MISTAKES_LIST).toBe('mistakes-list')
    expect(IPC.DB_GET_AI_CONFIGS).toBe('db-get-ai-configs')
  })
})

describe('App defaults', () => {
  it('THEMES 包含三个主题', () => {
    expect(THEMES).toEqual(['mocha', 'fjord', 'ember'])
  })

  it('DEFAULT_THEME 在 THEMES 列表中', () => {
    expect(THEMES).toContain(DEFAULT_THEME)
  })

  it('DEFAULT_LANGUAGE 是 python', () => {
    expect(DEFAULT_LANGUAGE).toBe('python')
  })

  it('MODULE_LABELS 包含所有模块', () => {
    expect(MODULE_LABELS.problems).toBe('刷题系统')
    expect(MODULE_LABELS.editor).toBe('代码编辑器')
    expect(MODULE_LABELS['ai-chat']).toBe('AI 助手')
    expect(MODULE_LABELS.mistakes).toBe('错题本')
    expect(MODULE_LABELS.knowledge).toBe('知识库')
    expect(MODULE_LABELS.settings).toBe('设置')
  })

  it('SESSION_TITLE_MAX_LENGTH 是正整数', () => {
    expect(SESSION_TITLE_MAX_LENGTH).toBeGreaterThan(0)
  })
})
