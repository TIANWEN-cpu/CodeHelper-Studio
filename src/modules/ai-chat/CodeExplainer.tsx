import { BookOpen } from 'lucide-react'
import { AIPanel, type AIPanelConfig } from './AIPanel'

interface CodeExplainerProps {
  code: string
  language: string
  onClose: () => void
}

function buildPrompt(code: string, language: string): string {
  return `请对以下 ${language} 代码进行详细解释：

\`\`\`${language}
${code}
\`\`\`

请按以下结构组织回答：

## 代码解释
逐步解释这段代码的功能和工作原理。

## 复杂度分析
- **时间复杂度**：分析算法的时间复杂度
- **空间复杂度**：分析算法的空间复杂度

## 替代方案
提供 1-2 种不同的实现方式，并简要比较优劣。`
}

const config: AIPanelConfig = {
  title: '代码解释',
  icon: BookOpen,
  iconClassName: 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]',
  buttonLabel: '解释这段代码',
  loadingLabel: '正在分析代码...',
  systemPrompt: '你是一位资深编程教师，擅长清晰地解释代码。请用中文回答，使用 Markdown 格式。',
  sessionName: '代码解释',
  buildPrompt,
  resultMaxHeight: 'max-h-96',
  errorPrefix: '解释代码',
}

/**
 * CodeExplainer -- AI-powered code explanation panel.
 *
 * Thin wrapper around AIPanel with explanation-specific config.
 */
export function CodeExplainer({ code, language, onClose }: CodeExplainerProps) {
  return <AIPanel code={code} language={language} onClose={onClose} config={config} />
}
