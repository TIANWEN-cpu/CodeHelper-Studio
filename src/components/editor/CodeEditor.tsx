import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeMirror, { keymap, type EditorView, type ViewUpdate } from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { cpp } from '@codemirror/lang-cpp'
import { sql } from '@codemirror/lang-sql'
import { dracula, cobalt, espresso, coolGlow, tomorrow, solarizedLight } from 'thememirror'
import {
  AnimationFrameReporter,
  cursorOffsetFromPosition,
  type EditorCursorPosition,
} from '@/utils/editorViewState'

// code_theme id → CodeMirror 主题扩展（仅本编辑器分包引入 thememirror）。
const THEME_MAP: Record<string, Extension> = {
  dracula,
  cobalt,
  espresso,
  coolGlow,
  tomorrow,
  solarizedLight,
}

function themeExtension(id: string): Extension {
  return THEME_MAP[id] ?? dracula
}

// 语言 → 语法扩展；支持 Python/JS/Node/TS/C 系/SQL，未知回退 Python。
function languageExtension(language: string): Extension {
  const lang = language.toLowerCase()
  if (lang === 'javascript' || lang === 'node' || lang === 'js') return javascript()
  if (lang === 'typescript' || lang === 'ts') return javascript({ typescript: true })
  // C / C++ / C#（C# 用 C++ 模式近似高亮）
  if (lang === 'c' || lang === 'cpp' || lang === 'c++' || lang === 'csharp') return cpp()
  if (lang === 'sql') return sql()
  return python()
}

// Tab 插入 4 空格（Python 友好），复用 react-codemirror 再导出的 keymap，避免直依赖 @codemirror/commands。
const tabKeymap = keymap.of([
  {
    key: 'Tab',
    run: (view) => {
      view.dispatch(view.state.replaceSelection('    '))
      return true
    },
  },
])

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language: string
  themeId: string
  readOnly?: boolean
  initialCursorPosition?: EditorCursorPosition
  initialScrollTop?: number
  onCursorPositionChange?: (position: EditorCursorPosition) => void
  onScrollTopChange?: (scrollTop: number) => void
}

/**
 * 工作区语法高亮编辑器（CodeMirror 6）。
 * 保留原 textarea 的全部能力：受控 value/onChange、行号、运行/提交、练习模式，
 * 并由 themeId（设置页"代码主题"）真实驱动配色。
 */
export function CodeEditor({
  value,
  onChange,
  language,
  themeId,
  readOnly = false,
  initialCursorPosition,
  initialScrollTop = 0,
  onCursorPositionChange,
  onScrollTopChange,
}: CodeEditorProps) {
  const extensions = useMemo(() => [languageExtension(language), tabKeymap], [language])
  const theme = useMemo(() => themeExtension(themeId), [themeId])
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const [restoredScrollTop] = useState(() => Math.max(0, initialScrollTop))
  const [initialSelection] = useState(() => ({
    anchor: cursorOffsetFromPosition(value, initialCursorPosition),
  }))

  const handleCreateEditor = useCallback((view: EditorView) => {
    setEditorView(view)
  }, [])

  useEffect(() => {
    if (!editorView) return
    let active = true
    editorView.requestMeasure({
      read: () => restoredScrollTop,
      write: (scrollTop, view) => {
        if (active && view === editorView) view.scrollDOM.scrollTop = scrollTop
      },
    })
    return () => {
      active = false
    }
  }, [editorView, restoredScrollTop])

  useEffect(() => {
    if (!editorView || !onScrollTopChange) return
    const scrollElement = editorView.scrollDOM
    const reporter = new AnimationFrameReporter<number>((scrollTop) => onScrollTopChange(scrollTop))
    const handleScroll = () => reporter.update(scrollElement.scrollTop)
    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
      reporter.dispose()
    }
  }, [editorView, onScrollTopChange])

  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if ((!update.selectionSet && !update.docChanged) || !onCursorPositionChange) return
      const head = update.state.selection.main.head
      const line = update.state.doc.lineAt(head)
      onCursorPositionChange({ lineNumber: line.number, column: head - line.from + 1 })
    },
    [onCursorPositionChange],
  )

  return (
    <div
      data-testid="code-editor"
      data-language={language}
      className="h-full w-full overflow-hidden"
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        onUpdate={handleUpdate}
        selection={initialSelection}
        extensions={extensions}
        theme={theme}
        height="100%"
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          foldGutter: false,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
        style={{ height: '100%', fontSize: '13px' }}
      />
    </div>
  )
}
