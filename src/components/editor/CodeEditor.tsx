import { useMemo } from 'react'
import CodeMirror, { keymap } from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { dracula, cobalt, espresso, coolGlow, tomorrow, solarizedLight } from 'thememirror'

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

// 语言 → 语法扩展；工作区以 Python 为主，兼容 JS/Node/TS。
function languageExtension(language: string): Extension {
  const lang = language.toLowerCase()
  if (lang === 'javascript' || lang === 'node' || lang === 'js') return javascript()
  if (lang === 'typescript' || lang === 'ts') return javascript({ typescript: true })
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
  /** Ctrl/Cmd + Enter 运行回调。 */
  onRun?: () => void
  readOnly?: boolean
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
  onRun,
  readOnly = false,
}: CodeEditorProps) {
  const extensions = useMemo(() => [languageExtension(language), tabKeymap], [language])
  const theme = useMemo(() => themeExtension(themeId), [themeId])

  return (
    <div
      className="h-full w-full overflow-hidden"
      onKeyDownCapture={(e) => {
        if (onRun && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault()
          onRun()
        }
      }}
    >
      <CodeMirror
        value={value}
        onChange={(val) => onChange(val)}
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
