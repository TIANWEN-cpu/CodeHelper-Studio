import { ClipboardCheck } from 'lucide-react'
import { AIPanel, type AIPanelConfig } from './AIPanel'

interface CodeReviewerProps {
  code: string
  language: string
  onClose: () => void
}

function buildPrompt(code: string, language: string): string {
  return `请对以下 ${language} 代码进行全面的 Code Review：

\`\`\`${language}
${code}
\`\`\`

请按以下结构组织回答：

## 代码评审

### 正确性
- 代码逻辑是否正确
- 是否存在潜在的 Bug

### 效率
- 时间和空间复杂度是否合理
- 是否有可优化的性能瓶颈

### 代码风格
- 命名是否清晰
- 代码结构是否合理
- 是否符合 ${language} 最佳实践

### 边界情况
- 是否处理了所有边界条件
- 是否有未处理的异常情况

### 改进建议
提供具体的改进方案，使用 diff 格式展示修改前后对比：

\`\`\`diff
- 旧代码
+ 新代码
\`\`\`

### 整体评分
给出代码质量评分（1-10），并总结主要优点和需要改进的地方。`
}

const config: AIPanelConfig = {
  title: '代码评审',
  icon: ClipboardCheck,
  iconClassName: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  buttonLabel: '评审这段代码',
  loadingLabel: '正在评审代码...',
  loadingClassName: 'text-blue-600',
  systemPrompt:
    '你是一位资深代码审查员，擅长发现代码中的问题并提供改进建议。请用中文回答，使用 Markdown 格式。对于每个改进建议，请尽量用 diff 格式展示代码变更。',
  sessionName: '代码评审',
  buildPrompt,
  errorPrefix: '评审代码',
}

/**
 * CodeReviewer -- AI-powered code review panel.
 *
 * Thin wrapper around AIPanel with code-review-specific config.
 */
export function CodeReviewer({ code, language, onClose }: CodeReviewerProps) {
  return <AIPanel code={code} language={language} onClose={onClose} config={config} />
}
