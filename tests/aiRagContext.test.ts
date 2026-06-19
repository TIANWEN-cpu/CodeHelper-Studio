import { describe, it, expect, vi } from 'vitest'

// injectRagContext 是纯函数，但所在模块会在顶层 import electron / db，故需 mock。
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
}))
vi.mock('../electron/db/index', () => ({
  getDB: () => ({ prepare: vi.fn() }),
  closeDB: () => {},
}))

import { injectRagContext, type RagContext } from '../electron/ipc/ai'
import type { ChatMessage } from '../electron/types/db'

const baseMessages: ChatMessage[] = [{ role: 'user', content: '怎么实现快排？' }]

describe('injectRagContext', () => {
  it('无 ragContext 时原样返回', () => {
    expect(injectRagContext(baseMessages, undefined)).toBe(baseMessages)
  })

  it('将知识库片段注入到最前面的 system 消息', () => {
    const rag: RagContext = {
      knowledgeChunks: ['快速排序是分治算法', '平均时间复杂度 O(n log n)'],
    }
    const result = injectRagContext(baseMessages, rag)
    expect(result.length).toBe(2)
    expect(result[0].role).toBe('system')
    expect(result[0].content).toContain('快速排序是分治算法')
    expect(result[0].content).toContain('O(n log n)')
    // 原消息保持在后
    expect(result[result.length - 1]).toEqual(baseMessages[0])
  })

  it('过滤空白/非字符串片段', () => {
    const rag = {
      knowledgeChunks: ['有效内容', '   ', 123, null, ''],
    } as unknown as RagContext
    const result = injectRagContext(baseMessages, rag)
    expect(result[0].content).toContain('有效内容')
    expect(result[0].content).not.toContain('123')
  })

  it('注入用户画像但不注入空画像字段', () => {
    const rag: RagContext = {
      userProfile: {
        preferredLanguage: 'zh-CN',
        difficultyLevel: 'beginner',
        weakTopics: ['递归', '指针'],
        strongTopics: [],
      },
    }
    const result = injectRagContext(baseMessages, rag)
    expect(result[0].role).toBe('system')
    expect(result[0].content).toContain('zh-CN')
    expect(result[0].content).toContain('递归')
  })

  it('片段与画像都为空时不注入', () => {
    const rag: RagContext = {
      knowledgeChunks: [],
      userProfile: { preferredLanguage: '', difficultyLevel: '', strongTopics: [], weakTopics: [] },
    }
    expect(injectRagContext(baseMessages, rag)).toBe(baseMessages)
  })

  it('限制片段数量上限（最多 8 条）', () => {
    const chunks = Array.from({ length: 20 }, (_, i) => `片段编号${i}`)
    const result = injectRagContext(baseMessages, { knowledgeChunks: chunks })
    expect(result[0].content).toContain('片段编号0')
    expect(result[0].content).toContain('片段编号7')
    expect(result[0].content).not.toContain('片段编号8')
  })
})
