import { Zap } from 'lucide-react'
import { AIPanel, type AIPanelConfig } from './AIPanel'

interface CodeOptimizerProps {
  code: string
  language: string
  onClose: () => void
}

function buildPrompt(code: string, language: string): string {
  return `请对以下 ${language} 代码进行性能优化分析：

\`\`\`${language}
${code}
\`\`\`

请按以下结构组织回答：

## 性能分析
分析当前代码的性能瓶颈和可优化点。

## 优化方案
提供优化后的完整代码，使用 diff 格式展示变更：

\`\`\`diff
- 原始代码
+ 优化代码
\`\`\`

## 复杂度对比
| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 时间复杂度 | O(?) | O(?) |
| 空间复杂度 | O(?) | O(?) |

## 注意事项
说明优化后的代码需要注意的事项或权衡。`
}

const config: AIPanelConfig = {
  title: '代码优化',
  icon: Zap,
  iconClassName: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  buttonLabel: '分析优化空间',
  loadingLabel: '正在分析优化空间...',
  loadingClassName: 'text-amber-600',
  systemPrompt:
    '你是一位性能优化专家，擅长分析和优化代码性能。请用中文回答，使用 Markdown 格式和 diff 格式展示代码变更。',
  sessionName: '代码优化',
  buildPrompt,
  errorPrefix: '优化分析',
}

/**
 * CodeOptimizer -- AI-powered code optimization panel.
 *
 * Thin wrapper around AIPanel with optimization-specific config.
 */
export function CodeOptimizer({ code, language, onClose }: CodeOptimizerProps) {
  return <AIPanel code={code} language={language} onClose={onClose} config={config} />
}
