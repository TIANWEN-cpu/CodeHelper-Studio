import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from '@/utils/markdown'
import { cn } from '@/lib/utils'

export type MarkdownVariant = 'ai' | 'learn' | 'knowledge'

const VARIANT_CLASS: Record<MarkdownVariant, string> = {
  ai: 'ai-markdown',
  learn: 'learn-markdown',
  knowledge: 'knowledge-markdown',
}

export interface MarkdownProps {
  content: string
  variant?: MarkdownVariant
  className?: string
}

/**
 * 流式渲染节流：尾随 ~60ms 防抖。静态内容只在 content 变化时重渲染，
 * 60ms 的延迟不可感知；流式 chunk 期间把昂贵的 markdown 重算收敛到 ~16 次/秒。
 */
const STREAM_DEBOUNCE_MS = 60

/**
 * Markdown 渲染薄封装：统一 AI 消息 / 课程 / 知识库三处
 * renderMarkdown + dangerouslySetInnerHTML 的重复写法。
 * renderMarkdown 内部已做 HTML 转义与安全链接过滤。
 */
export function Markdown({ content, variant = 'ai', className }: MarkdownProps) {
  const [renderedContent, setRenderedContent] = useState(content)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setRenderedContent(content)
    }, STREAM_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [content])

  const html = useMemo(() => renderMarkdown(renderedContent), [renderedContent])
  return (
    <div
      className={cn(VARIANT_CLASS[variant], className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
