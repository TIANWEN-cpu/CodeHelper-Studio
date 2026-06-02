import { ipcMain, BrowserWindow } from 'electron'
import { getDB } from '../db/index'
import { getRelevantMemories, markMemoriesUsed } from './chat'

interface AIConfig {
  id: number
  name: string
  api_key: string
  base_url: string
  model: string
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function registerAIIPC() {
  let currentAbortController: AbortController | null = null

  ipcMain.handle(
    'ai-chat',
    async (
      event,
      args: {
        messages: ChatMessage[]
        configId?: number
        requestId?: string
        includeMemories?: boolean
      },
    ) => {
      if (!args || typeof args !== 'object') throw new Error('参数无效')
      if (!Array.isArray(args.messages) || args.messages.length === 0)
        throw new Error('参数无效: messages')
      if (args.messages.length > 200) throw new Error('消息数量超限')
      for (const msg of args.messages) {
        if (!msg || typeof msg !== 'object') throw new Error('参数无效: message')
        if (!['user', 'assistant', 'system'].includes(msg.role))
          throw new Error('参数无效: message role')
        if (typeof msg.content !== 'string') throw new Error('参数无效: message content')
        msg.content = msg.content.slice(0, 100000)
      }
      if (
        args.configId !== undefined &&
        (typeof args.configId !== 'number' || !Number.isFinite(args.configId) || args.configId < 1)
      )
        throw new Error('参数无效: configId')
      if (args.requestId !== undefined) {
        if (typeof args.requestId !== 'string') throw new Error('参数无效: requestId')
        args.requestId = args.requestId.trim().slice(0, 200)
      }
      if (currentAbortController) {
        currentAbortController.abort()
      }
      currentAbortController = new AbortController()
      try {
        const db = getDB()
        let config: AIConfig | undefined

        if (args.configId) {
          config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(args.configId) as
            | AIConfig
            | undefined
        } else {
          config = db.prepare('SELECT * FROM ai_configs WHERE is_default = 1').get() as
            | AIConfig
            | undefined
          if (!config) {
            config = db.prepare('SELECT * FROM ai_configs LIMIT 1').get() as AIConfig | undefined
          }
        }

        if (!config) {
          throw new Error('未配置AI模型，请先在设置中添加')
        }

        const url = `${config.base_url.replace(/\/$/, '')}/chat/completions`

        const requestId = args.requestId ?? `req-${Date.now()}`
        const win = BrowserWindow.fromWebContents(event.sender)
        const messages = injectMemories(args.messages, args.includeMemories)

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.api_key}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            stream: true,
          }),
          signal: currentAbortController.signal,
        })

        if (!response.ok) {
          const text = await response.text()
          throw new Error(`AI API 错误 (${response.status}): ${text}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('AI 响应为空')
        }
        const decoder = new TextDecoder()

        let buffer = ''
        let fullContent = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue
            const data = trimmed.slice(6)
            if (data === '[DONE]') continue

            try {
              const json = JSON.parse(data)
              const content = json.choices?.[0]?.delta?.content
              if (content && win) {
                fullContent += content
                win.webContents.send('ai-chat-chunk', { requestId, chunk: content })
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        if (win) {
          win.webContents.send('ai-chat-done', { requestId, content: fullContent })
        }
        return { success: true, requestId, content: fullContent }
      } finally {
        currentAbortController = null
      }
    },
  )
}

function injectMemories(messages: ChatMessage[], includeMemories = false) {
  if (!includeMemories) {
    return messages
  }

  const lastUserMessage =
    [...messages]
      .reverse()
      .find((message) => message.role === 'user')
      ?.content.trim() ?? ''
  const memories = getRelevantMemories(lastUserMessage)

  if (memories.length === 0) {
    return messages
  }

  markMemoriesUsed(memories.map((memory) => memory.id))

  const memoryPrompt = [
    '以下是用户的跨对话长期记忆，仅在相关时使用，不要生硬复述：',
    ...memories.map((memory, index) => `${index + 1}. [${memory.category}] ${memory.content}`),
  ].join('\n')

  return [{ role: 'system', content: memoryPrompt }, ...messages]
}
