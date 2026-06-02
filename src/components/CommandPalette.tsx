/**
 * CommandPalette -- enhanced Ctrl+Shift+P command palette.
 *
 * Features:
 * - Fuzzy search through available commands
 * - Keyboard navigation (up/down/enter/escape)
 * - Recent commands section (persisted to localStorage)
 * - Category filter tabs (press 1-6 or click to filter)
 * - Command count and rich descriptions
 * - Snippet management commands
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Search,
  X,
  Clock,
  Zap,
  Navigation,
  Code,
  Settings as SettingsIcon,
  BarChart3,
  Puzzle,
  Filter,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useChatStore } from '../stores/chatStore'
import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Command {
  id: string
  label: string
  description?: string
  category: CommandCategory
  shortcut?: string
  keywords?: string[]
  action: () => void
}

type CommandCategory = 'navigation' | 'editor' | 'ai' | 'view' | 'tools' | 'snippets'

const CATEGORY_META: Record<
  CommandCategory,
  { label: string; icon: LucideIcon; shortcut: string }
> = {
  navigation: { label: '导航', icon: Navigation, shortcut: '1' },
  editor: { label: '编辑器', icon: Code, shortcut: '2' },
  ai: { label: 'AI 助手', icon: Zap, shortcut: '3' },
  view: { label: '视图', icon: SettingsIcon, shortcut: '4' },
  tools: { label: '工具', icon: BarChart3, shortcut: '5' },
  snippets: { label: '代码片段', icon: Puzzle, shortcut: '6' },
}

const RECENT_COMMANDS_KEY = 'codehelper-recent-commands'
const MAX_RECENT = 5

// ---------------------------------------------------------------------------
// Fuzzy search
// ---------------------------------------------------------------------------

/**
 * Simple fuzzy match: checks whether all characters of `query` appear
 * in `text` in order (case-insensitive). Returns a score (lower is better)
 * or null if no match. Consecutive matches get a bonus.
 */
function fuzzyScore(text: string, query: string): number | null {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  let ti = 0
  let qi = 0
  let score = 0
  let lastMatch = -2

  while (ti < lowerText.length && qi < lowerQuery.length) {
    if (lowerText[ti] === lowerQuery[qi]) {
      // Consecutive match bonus
      if (ti === lastMatch + 1) {
        score -= 1
      }
      score += ti - lastMatch - 1 // penalty for gaps
      lastMatch = ti
      qi++
    }
    ti++
  }

  if (qi !== lowerQuery.length) return null // not all chars matched
  return score
}

/**
 * Returns true if the command matches the query via fuzzy search on
 * label or keywords.
 */
function matchesQuery(cmd: Command, query: string): number | null {
  const labelScore = fuzzyScore(cmd.label, query)
  const keywordScores = (cmd.keywords ?? [])
    .map((kw) => fuzzyScore(kw, query))
    .filter((s) => s !== null) as number[]
  const best = Math.min(labelScore ?? Infinity, ...keywordScores)
  return best === Infinity ? null : best
}

// ---------------------------------------------------------------------------
// Recent commands persistence
// ---------------------------------------------------------------------------

function loadRecentCommands(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COMMANDS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveRecentCommand(id: string) {
  const recent = loadRecentCommands().filter((r) => r !== id)
  recent.unshift(id)
  localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeCategory, setActiveCategory] = useState<CommandCategory | 'all'>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  const setActiveModule = useAppStore((s) => s.setActiveModule)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const createSession = useChatStore((s) => s.createSession)

  const commands: Command[] = useMemo(
    () => [
      // Navigation
      {
        id: 'nav-problems',
        label: '切换到：刷题',
        description: '打开题目列表和代码编辑器',
        category: 'navigation',
        keywords: ['problems', '题目', '刷题'],
        action: () => setActiveModule('problems'),
      },
      {
        id: 'nav-editor',
        label: '切换到：编辑器',
        description: '打开独立的代码编辑器',
        category: 'navigation',
        keywords: ['editor', '代码', '编辑器'],
        action: () => setActiveModule('editor'),
      },
      {
        id: 'nav-chat',
        label: '切换到：AI 助手',
        description: '与 AI 进行编程对话',
        category: 'navigation',
        keywords: ['chat', '对话', 'ai'],
        action: () => setActiveModule('ai-chat'),
      },
      {
        id: 'nav-mistakes',
        label: '切换到：错题本',
        description: '查看和复习做错的题目',
        category: 'navigation',
        keywords: ['mistakes', '错题'],
        action: () => setActiveModule('mistakes'),
      },
      {
        id: 'nav-knowledge',
        label: '切换到：知识库',
        description: '浏览知识库文档',
        category: 'navigation',
        keywords: ['knowledge', '知识', '文档'],
        action: () => setActiveModule('knowledge'),
      },
      {
        id: 'nav-settings',
        label: '切换到：设置',
        description: '配置 AI、主题和其他选项',
        category: 'navigation',
        keywords: ['settings', '配置', '设置'],
        action: () => setActiveModule('settings'),
      },
      {
        id: 'nav-stats',
        label: '切换到：统计面板',
        description: '查看学习进度和编码数据',
        category: 'navigation',
        keywords: ['stats', 'statistics', '统计', '数据'],
        action: () => setActiveModule('stats'),
      },
      {
        id: 'nav-search',
        label: '切换到：全局搜索',
        description: '搜索题目、知识库和编辑器内容',
        category: 'navigation',
        keywords: ['search', '搜索', '查找'],
        action: () => setActiveModule('search'),
      },
      {
        id: 'nav-help',
        label: '切换到：帮助中心',
        description: '查看帮助文档和快捷键参考',
        category: 'navigation',
        shortcut: 'F1',
        keywords: ['help', '帮助', '快捷键', 'FAQ'],
        action: () => setActiveModule('help'),
      },

      // AI
      {
        id: 'new-chat',
        label: '新建 AI 对话',
        description: '创建一个新的 AI 对话会话',
        category: 'ai',
        shortcut: 'Ctrl+N',
        keywords: ['chat', '新建', '对话'],
        action: () => {
          setActiveModule('ai-chat')
          void createSession()
        },
      },

      // Editor
      {
        id: 'run-code',
        label: '运行代码',
        description: '执行当前编辑器中的代码',
        category: 'editor',
        shortcut: 'Ctrl+Enter',
        keywords: ['run', '执行', '运行'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:run')),
      },
      {
        id: 'new-file',
        label: '新建文件',
        description: '在编辑器中创建新文件',
        category: 'editor',
        shortcut: 'Ctrl+N',
        keywords: ['new', 'file', '新建', '文件'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:new-file')),
      },
      {
        id: 'toggle-minimap',
        label: '切换 Minimap',
        description: '显示或隐藏编辑器小地图',
        category: 'editor',
        keywords: ['minimap', '小地图'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:toggle-minimap')),
      },
      {
        id: 'toggle-split',
        label: '切换分屏编辑',
        description: '启用或禁用并排编辑模式',
        category: 'editor',
        keywords: ['split', '分屏', '并排'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:toggle-split')),
      },
      {
        id: 'toggle-terminal',
        label: '切换终端面板',
        description: '显示或隐藏集成终端',
        category: 'editor',
        keywords: ['terminal', '终端', '控制台'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:toggle-terminal')),
      },
      {
        id: 'insert-snippet',
        label: '插入代码片段...',
        description: '从代码片段库中选择并插入',
        category: 'editor',
        keywords: ['snippet', '片段', '模板', '代码片段'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:show-snippets')),
      },
      {
        id: 'format-code',
        label: '格式化代码',
        description: '自动格式化当前文件',
        category: 'editor',
        keywords: ['format', '格式化', '美化'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:format-code')),
      },

      // View
      {
        id: 'toggle-sidebar',
        label: '切换侧栏显示',
        description: '显示或隐藏左侧导航栏',
        category: 'view',
        keywords: ['sidebar', '侧栏'],
        action: toggleSidebar,
      },
      {
        id: 'global-search',
        label: '全局搜索',
        description: '搜索题目、知识库和编辑器内容',
        category: 'view',
        shortcut: 'Ctrl+Shift+F',
        keywords: ['search', 'find', '搜索', '查找'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:global-search')),
      },
      {
        id: 'focus-problem-list',
        label: '聚焦题目列表',
        description: '展开并聚焦到题目列表',
        category: 'view',
        keywords: ['focus', '聚焦', '题目列表'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:focus-problems')),
      },
      {
        id: 'show-help',
        label: '打开帮助中心',
        description: '查看帮助文档、FAQ 和快捷键参考',
        category: 'view',
        shortcut: 'F1',
        keywords: ['help', '帮助', '快捷键', 'FAQ'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:help-center')),
      },

      // Tools
      {
        id: 'show-stats',
        label: '查看统计数据',
        description: '打开统计面板查看学习进度',
        category: 'tools',
        keywords: ['stats', 'statistics', '统计', '数据'],
        action: () => setActiveModule('stats'),
      },
      {
        id: 'manage-snippets',
        label: '管理代码片段',
        description: '创建、编辑或删除自定义代码片段',
        category: 'tools',
        keywords: ['snippet', 'manage', '片段', '管理'],
        action: () => window.dispatchEvent(new CustomEvent('codehelper:manage-snippets')),
      },

      // Snippets
      {
        id: 'snippet-py-main',
        label: 'Python: Main Entry',
        description: 'if __name__ == "__main__": ...',
        category: 'snippets',
        keywords: ['python', 'main', '入口'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'main', language: 'python' },
            }),
          ),
      },
      {
        id: 'snippet-py-def',
        label: 'Python: Function',
        description: 'def name(params): ...',
        category: 'snippets',
        keywords: ['python', 'def', 'function', '函数'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'def', language: 'python' },
            }),
          ),
      },
      {
        id: 'snippet-py-class',
        label: 'Python: Class',
        description: 'class Name: ...',
        category: 'snippets',
        keywords: ['python', 'class', '类'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'cls', language: 'python' },
            }),
          ),
      },
      {
        id: 'snippet-py-try',
        label: 'Python: Try/Except',
        description: 'try: ... except: ...',
        category: 'snippets',
        keywords: ['python', 'try', 'except', '异常'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'try', language: 'python' },
            }),
          ),
      },
      {
        id: 'snippet-cpp-main',
        label: 'C++: Main',
        description: '#include <iostream> ... int main()',
        category: 'snippets',
        keywords: ['cpp', 'c++', 'main'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'main', language: 'cpp' },
            }),
          ),
      },
      {
        id: 'snippet-cpp-class',
        label: 'C++: Class',
        description: 'class Name { public: ... };',
        category: 'snippets',
        keywords: ['cpp', 'c++', 'class', '类'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'cls', language: 'cpp' },
            }),
          ),
      },
      {
        id: 'snippet-java-main',
        label: 'Java: Main',
        description: 'public class Main { public static void main }',
        category: 'snippets',
        keywords: ['java', 'main'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'main', language: 'java' },
            }),
          ),
      },
      {
        id: 'snippet-go-main',
        label: 'Go: Main',
        description: 'package main ... func main()',
        category: 'snippets',
        keywords: ['go', 'main'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'main', language: 'go' },
            }),
          ),
      },
      {
        id: 'snippet-rust-main',
        label: 'Rust: Main',
        description: 'fn main() { ... }',
        category: 'snippets',
        keywords: ['rust', 'main'],
        action: () =>
          window.dispatchEvent(
            new CustomEvent('codehelper:insert-named-snippet', {
              detail: { prefix: 'main', language: 'rust' },
            }),
          ),
      },
    ],
    [setActiveModule, toggleSidebar, createSession],
  )

  // Build grouped results
  const groupedResults = useMemo(() => {
    const recentIds = loadRecentCommands()

    // Filter by category
    const categoryFiltered =
      activeCategory === 'all' ? commands : commands.filter((c) => c.category === activeCategory)

    if (!query) {
      // Show recent commands first, then all commands grouped by category
      const recentCmds = recentIds
        .map((id) => categoryFiltered.find((c) => c.id === id))
        .filter(Boolean) as Command[]

      const groups = new Map<CommandCategory, Command[]>()
      for (const cmd of categoryFiltered) {
        if (!recentCmds.find((r) => r.id === cmd.id)) {
          const list = groups.get(cmd.category) ?? []
          list.push(cmd)
          groups.set(cmd.category, list)
        }
      }

      return { recent: recentCmds, groups }
    }

    // Fuzzy search
    const scored = categoryFiltered
      .map((cmd) => ({ cmd, score: matchesQuery(cmd, query) }))
      .filter((item) => item.score !== null)
      .sort((a, b) => (a.score as number) - (b.score as number))

    return {
      recent: [],
      groups: new Map<CommandCategory, Command[]>([['navigation', scored.map((s) => s.cmd)]]),
    }
  }, [query, commands, activeCategory])

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const result: Command[] = []
    if (groupedResults.recent.length > 0 && !query) {
      result.push(...groupedResults.recent)
    }
    for (const cmds of groupedResults.groups.values()) {
      result.push(...cmds)
    }
    return result
  }, [groupedResults, query])

  // Listen for the custom event to open
  useEffect(() => {
    const handler = () => {
      setOpen(true)
      setQuery('')
      setSelectedIndex(0)
      setActiveCategory('all')
    }
    window.addEventListener('codehelper:command-palette', handler)
    return () => window.removeEventListener('codehelper:command-palette', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, activeCategory])

  const executeCommand = useCallback((cmd: Command) => {
    setOpen(false)
    saveRecentCommand(cmd.id)
    cmd.action()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, flatList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && flatList[selectedIndex]) {
        executeCommand(flatList[selectedIndex])
      } else if (e.key === 'Tab') {
        // Cycle through categories with Tab
        e.preventDefault()
        const cats: Array<CommandCategory | 'all'> = [
          'all',
          ...(Object.keys(CATEGORY_META) as CommandCategory[]),
        ]
        const idx = cats.indexOf(activeCategory)
        setActiveCategory(cats[(idx + 1) % cats.length])
      }
    },
    [flatList, selectedIndex, executeCommand, activeCategory],
  )

  if (!open) return null

  let flatIndex = -1

  const renderCommandButton = (cmd: Command, _idx: number) => {
    flatIndex++
    const currentFlatIndex = flatIndex
    return (
      <button
        key={cmd.id}
        id={`cmd-${cmd.id}`}
        role="option"
        aria-selected={currentFlatIndex === selectedIndex}
        onClick={() => executeCommand(cmd)}
        onMouseEnter={() => setSelectedIndex(currentFlatIndex)}
        className={`flex w-full flex-col px-4 py-2.5 text-left text-sm transition-colors ${
          currentFlatIndex === selectedIndex
            ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-text-primary)]'
            : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-hover)]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span>{cmd.label}</span>
          {cmd.shortcut && (
            <kbd className="rounded border border-[var(--theme-border)] bg-[var(--theme-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--theme-text-muted)]">
              {cmd.shortcut}
            </kbd>
          )}
        </div>
        {cmd.description && (
          <span className="mt-0.5 truncate text-[11px] text-[var(--theme-text-muted)]">
            {cmd.description}
          </span>
        )}
      </button>
    )
  }

  const categoryKeys = Object.keys(CATEGORY_META) as CommandCategory[]

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      {/* Palette */}
      <div
        className="ui-card relative z-10 w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--theme-border)] px-4 py-3">
          <Search
            size={16}
            className="shrink-0 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入命令进行搜索..."
            aria-label="搜索命令"
            aria-controls="command-palette-results"
            aria-activedescendant={
              flatList[selectedIndex] ? `cmd-${flatList[selectedIndex].id}` : undefined
            }
            role="combobox"
            aria-expanded={flatList.length > 0}
            aria-haspopup="listbox"
            className="flex-1 bg-transparent text-sm text-[var(--theme-text-primary)] outline-none placeholder:text-[var(--theme-text-muted)]"
          />
          <button
            onClick={() => setOpen(false)}
            className="shrink-0 rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
            aria-label="关闭命令面板"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-1 border-b border-[var(--theme-border)] px-3 py-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
                : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
            }`}
          >
            <Filter size={10} aria-hidden="true" />
            全部
          </button>
          {categoryKeys.map((cat) => {
            const meta = CATEGORY_META[cat]
            const Icon = meta.icon
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
                    : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <Icon size={10} aria-hidden="true" />
                {meta.label}
              </button>
            )
          })}
        </div>

        {/* Results */}
        <div
          id="command-palette-results"
          className="max-h-80 overflow-y-auto py-2"
          role="listbox"
          aria-label="命令列表"
        >
          {flatList.length === 0 ? (
            <div
              className="px-4 py-6 text-center text-sm text-[var(--theme-text-muted)]"
              role="status"
            >
              没有匹配的命令
            </div>
          ) : (
            <>
              {/* Recent commands */}
              {groupedResults.recent.length > 0 && !query && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <Clock size={12} className="text-[var(--theme-text-muted)]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-muted)]">
                      最近使用
                    </span>
                  </div>
                  {groupedResults.recent.map((cmd) => renderCommandButton(cmd, 0))}
                  <div className="mx-4 my-1 border-t border-[var(--theme-border)]" />
                </div>
              )}

              {/* Grouped commands */}
              {Array.from(groupedResults.groups.entries()).map(([category, cmds]) => {
                const meta = CATEGORY_META[category]
                const Icon = meta.icon
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 px-4 py-1.5">
                      <Icon size={12} className="text-[var(--theme-text-muted)]" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-muted)]">
                        {meta.label}
                      </span>
                    </div>
                    {cmds.map((cmd) => renderCommandButton(cmd, 0))}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-[var(--theme-border)] px-4 py-2 text-[10px] text-[var(--theme-text-muted)]">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="font-mono">↑↓</kbd> 导航
            </span>
            <span>
              <kbd className="font-mono">Enter</kbd> 执行
            </span>
            <span>
              <kbd className="font-mono">Tab</kbd> 切换分类
            </span>
            <span>
              <kbd className="font-mono">Esc</kbd> 关闭
            </span>
          </div>
          <span>{flatList.length} 个命令</span>
        </div>
      </div>
    </div>
  )
}
