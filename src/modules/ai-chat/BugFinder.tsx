import { useState } from 'react'
import { AlertOctagon, AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import { AIPanel, type AIPanelConfig } from './AIPanel'

interface BugFinderProps {
  code: string
  language: string
  onClose: () => void
}

type BugSeverity = 'critical' | 'warning' | 'info'

const SEVERITY_CONFIG: Record<
  BugSeverity,
  { label: string; color: string; icon: React.ReactNode }
> = {
  critical: {
    label: '严重',
    color: 'var(--theme-danger)',
    icon: <AlertOctagon size={12} />,
  },
  warning: {
    label: '警告',
    color: 'var(--theme-warning, #f59e0b)',
    icon: <AlertTriangle size={12} />,
  },
  info: {
    label: '提示',
    color: 'var(--theme-accent)',
    icon: <Info size={12} />,
  },
}

function buildPrompt(code: string, language: string): string {
  return `请对以下 ${language} 代码进行 Bug 检测分析：

\`\`\`${language}
${code}
\`\`\`

请按以下结构组织回答：

## Bug 检测结果

对每个发现的问题，使用以下格式：

### [严重/警告/提示] 问题标题
- **位置**：第 X 行（如有）
- **描述**：详细说明问题
- **修复建议**：提供修复后的代码

请重点检查以下方面：

1. **运行时错误**：空指针、数组越界、类型错误等
2. **逻辑错误**：条件判断错误、循环问题、计算错误等
3. **可疑模式**：未使用的变量、死代码、重复逻辑等
4. **安全漏洞**：注入风险、XSS、不安全的数据处理等
5. **并发问题**：竞态条件、死锁风险等（如适用）

## 安全评分
给出代码的安全性评分（1-10），并简要说明原因。

## 总结
概述发现的问题数量和整体代码质量。`
}

/**
 * BugFinder -- AI-powered bug detection panel.
 *
 * Thin wrapper around AIPanel with BugFinder-specific config
 * and severity filter UI.
 */
export function BugFinder({ code, language, onClose }: BugFinderProps) {
  const [severityFilter, setSeverityFilter] = useState<BugSeverity | 'all'>('all')

  const severityFilterUI = (
    <div className="flex gap-1 border-b border-[var(--theme-border)] px-4 py-2">
      <button
        onClick={() => setSeverityFilter('all')}
        className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
          severityFilter === 'all'
            ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
            : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)]'
        }`}
      >
        全部
      </button>
      {(Object.keys(SEVERITY_CONFIG) as BugSeverity[]).map((sev) => (
        <button
          key={sev}
          onClick={() => setSeverityFilter(sev)}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors ${
            severityFilter === sev
              ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
              : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)]'
          }`}
        >
          {SEVERITY_CONFIG[sev].icon}
          {SEVERITY_CONFIG[sev].label}
        </button>
      ))}
    </div>
  )

  const config: AIPanelConfig = {
    title: 'Bug 检测',
    icon: ShieldAlert,
    iconClassName: 'bg-[var(--theme-danger-soft, #fef2f2)] text-[var(--theme-danger)]',
    buttonLabel: '检测潜在 Bug',
    loadingLabel: '正在扫描代码...',
    loadingClassName: 'text-[var(--theme-danger)]',
    loadingHint: '检查运行时错误、逻辑问题、安全漏洞等',
    systemPrompt:
      '你是一位资深安全工程师和代码质量专家。请仔细检查代码中的所有潜在问题，包括 Bug、安全漏洞和可疑模式。用中文回答，使用 Markdown 格式。每个问题请标注严重程度：[严重]、[警告]、[提示]。',
    sessionName: 'Bug 检测',
    buildPrompt,
    errorPrefix: '检测 Bug',
    extraHeader: severityFilterUI,
  }

  return <AIPanel code={code} language={language} onClose={onClose} config={config} />
}
