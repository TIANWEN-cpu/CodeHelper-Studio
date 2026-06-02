/**
 * Pure helper functions extracted from chat IPC for testability.
 * These functions have zero Electron/Node dependencies.
 */

export function extractMemoryCandidates(
  message: string,
): Array<{ content: string; category: string }> {
  const text = message.trim()
  const patterns: Array<{ regex: RegExp; category: string }> = [
    { regex: /^(?:请|帮我)?记住[:：\s]*(.+)$/i, category: 'fact' },
    { regex: /^(?:请|帮我)?记一下[:：\s]*(.+)$/i, category: 'fact' },
    { regex: /^(?:以后|后面)(.+)$/i, category: 'preference' },
  ]

  return patterns
    .map(({ regex, category }) => {
      const matched = text.match(regex)?.[1]?.trim()
      if (!matched || matched.length < 2) return null
      return { content: matched.slice(0, 300), category }
    })
    .filter((item): item is { content: string; category: string } => Boolean(item))
}

export function buildSearchTerms(query: string): string[] {
  const normalized = query.trim().toLowerCase()
  const terms = new Set<string>()

  normalized
    .split(/[\s,，。！？!?:：;；()[\]{}"'`]+/)
    .filter((item) => item.length >= 2)
    .forEach((item) => terms.add(item))

  const compact = normalized.replace(/\s+/g, '')
  if (compact.length >= 2) {
    terms.add(compact.slice(0, Math.min(compact.length, 12)))
  }

  return [...terms]
}

export const BUILTIN_PRESETS = [
  { name: '通用助手', prompt: '你是一个友好的AI助手，请用中文回答问题。' },
  {
    name: '代码专家',
    prompt: '你是一个资深编程专家，擅长代码审查、调试和优化。请用中文回答，给出代码时附带注释。',
  },
  {
    name: '面试官',
    prompt:
      '你是一个技术面试官，会针对编程和算法提出问题，评估回答质量，并给出改进建议。请用中文交流。',
  },
  {
    name: '学习导师',
    prompt:
      '你是一个耐心的编程学习导师，善于用简单的语言解释复杂概念，会循序渐进地引导学习。请用中文教学。',
  },
]
