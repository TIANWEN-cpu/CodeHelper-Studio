/**
 * RAG Context Service — assembles personalized context for AI queries.
 *
 * Collects recent problems, learning history, knowledge base content,
 * and user profile data to provide context-aware AI responses.
 *
 * This service sits between the renderer UI and the main-process IPC,
 * orchestrating multiple data sources into a single context payload.
 */

import { typedInvoke } from '../api/ipc'
import type { RAGContext } from '../types/knowledge'
import { toErrorMessage } from '../utils/errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RAGContextOptions {
  /** Optional query to focus context retrieval. */
  query?: string
  /** Max recent problems to include. */
  maxProblems?: number
  /** Max learning history entries to include. */
  maxHistory?: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class RAGContextServiceImpl {
  /**
   * Assemble a full RAG context payload for the given query.
   *
   * Delegates to the main process via IPC, which handles database
   * queries and AI-powered context selection.
   */
  async assembleContext(options: RAGContextOptions = {}): Promise<RAGContext> {
    try {
      return await typedInvoke('knowledge-rag-context', options.query)
    } catch (err) {
      console.error('[RAGContextService] Failed to assemble context:', toErrorMessage(err))
      // Return a minimal empty context so callers can still proceed
      return this.emptyContext()
    }
  }

  /**
   * Build a formatted context string suitable for injection into
   * a system prompt or user message preamble.
   */
  async buildContextPreamble(options: RAGContextOptions = {}): Promise<string> {
    const ctx = await this.assembleContext(options)
    const sections: string[] = []

    // Recent problems section
    if (ctx.recentProblems.length > 0) {
      const problems = ctx.recentProblems
        .slice(0, options.maxProblems ?? 5)
        .map(
          (p) => `- ${p.title} (${p.difficulty}, ${p.tags}) ${p.solved ? '[已解决]' : '[未解决]'}`,
        )
        .join('\n')
      sections.push(`## 用户近期练习题目\n${problems}`)
    }

    // Learning history section
    if (ctx.learningHistory.length > 0) {
      const history = ctx.learningHistory
        .slice(0, options.maxHistory ?? 5)
        .map((e) => `- [${e.source}] ${e.topic}: ${e.summary}`)
        .join('\n')
      sections.push(`## 学习历史\n${history}`)
    }

    // Knowledge base section
    if (ctx.knowledgeChunks.length > 0) {
      const chunks = ctx.knowledgeChunks.slice(0, 3).join('\n---\n')
      sections.push(`## 知识库相关内容\n${chunks}`)
    }

    // User profile section
    const profile = ctx.userProfile
    if (
      profile.preferredLanguage ||
      profile.strongTopics.length > 0 ||
      profile.weakTopics.length > 0
    ) {
      const lines: string[] = []
      if (profile.preferredLanguage) lines.push(`- 偏好语言: ${profile.preferredLanguage}`)
      if (profile.difficultyLevel) lines.push(`- 难度水平: ${profile.difficultyLevel}`)
      if (profile.strongTopics.length > 0)
        lines.push(`- 擅长领域: ${profile.strongTopics.join(', ')}`)
      if (profile.weakTopics.length > 0) lines.push(`- 薄弱领域: ${profile.weakTopics.join(', ')}`)
      sections.push(`## 用户画像\n${lines.join('\n')}`)
    }

    if (sections.length === 0) {
      return ''
    }

    return `以下上下文信息可以帮助你更好地回答用户问题：\n\n${sections.join('\n\n')}`
  }

  /**
   * Enrich an AI chat payload with RAG context.
   *
   * Returns a new messages array with the context injected as a
   * system-level message, so the AI has access to the user's
   * recent activity and knowledge base.
   */
  async enrichMessages(
    messages: Array<{ role: string; content: string }>,
    options: RAGContextOptions = {},
  ): Promise<Array<{ role: string; content: string }>> {
    const preamble = await this.buildContextPreamble(options)
    if (!preamble) return messages

    // Insert context after the first system message (if present),
    // or prepend it as a new system message
    const result = [...messages]
    const systemIndex = result.findIndex((m) => m.role === 'system')
    if (systemIndex >= 0) {
      result[systemIndex] = {
        ...result[systemIndex],
        content: `${result[systemIndex].content}\n\n${preamble}`,
      }
    } else {
      result.unshift({ role: 'system', content: preamble })
    }

    return result
  }

  private emptyContext(): RAGContext {
    return {
      recentProblems: [],
      learningHistory: [],
      knowledgeChunks: [],
      userProfile: {
        preferredLanguage: '',
        difficultyLevel: '',
        strongTopics: [],
        weakTopics: [],
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const ragContextService = new RAGContextServiceImpl()
