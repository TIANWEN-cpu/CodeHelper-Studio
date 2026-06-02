import { ipcMain, BrowserWindow } from 'electron'
import { getDB } from '../db/index'
import { getRelevantMemories, markMemoriesUsed } from './chat'
import type { AIConfigForChat, ChatMessage } from '../types/db'

export function registerAIIPC(): void {
  const activeRequests = new Map<string, AbortController>()

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

      const requestId = args.requestId ?? `req-${Date.now()}`

      // Cancel any previous request with the same requestId
      const existingController = activeRequests.get(requestId)
      if (existingController) {
        existingController.abort()
      }

      const controller = new AbortController()
      activeRequests.set(requestId, controller)

      // Auto-abort after 120s to prevent indefinite hangs
      const requestTimeout = setTimeout(() => controller.abort(), 120000)

      try {
        const db = getDB()
        let config: AIConfigForChat | undefined

        if (args.configId) {
          config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(args.configId) as
            | AIConfigForChat
            | undefined
        } else {
          config = db.prepare('SELECT * FROM ai_configs WHERE is_default = 1').get() as
            | AIConfigForChat
            | undefined
          if (!config) {
            config = db.prepare('SELECT * FROM ai_configs LIMIT 1').get() as
              | AIConfigForChat
              | undefined
          }
        }

        if (!config) {
          throw new Error('未配置AI模型，请先在设置中添加')
        }

        const url = `${config.base_url.replace(/\/$/, '')}/chat/completions`
        const win = BrowserWindow.fromWebContents(event.sender)
        const messages = injectMemories(args.messages, args.includeMemories)

        let response: Response
        try {
          response = await fetch(url, {
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
            signal: controller.signal,
          })
        } catch (fetchError) {
          const msg = fetchError instanceof Error ? fetchError.message : String(fetchError)
          if (msg.includes('abort')) {
            throw new Error('AI 请求已取消或超时')
          }
          throw new Error(`网络连接失败: ${msg}`)
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(`AI API 错误 (${response.status}): ${text.slice(0, 300)}`)
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
              // Malformed SSE JSON chunk — log at debug level for diagnostics
              console.debug('[ai] Skipping malformed SSE chunk:', data.slice(0, 100))
            }
          }
        }

        if (win) {
          win.webContents.send('ai-chat-done', { requestId, content: fullContent })
        }
        return { success: true, requestId, content: fullContent }
      } finally {
        clearTimeout(requestTimeout)
        activeRequests.delete(requestId)
      }
    },
  )
}

function injectMemories(messages: ChatMessage[], includeMemories = false): ChatMessage[] {
  if (!includeMemories) {
    return messages
  }

  try {
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
  } catch (error) {
    console.warn('[ai] Failed to inject memories, proceeding without:', error)
    return messages
  }
}
