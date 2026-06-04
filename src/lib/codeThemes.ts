// 代码主题选项（纯数据，无 CodeMirror 依赖）：供 store 默认值与设置页选择器使用。
// 真正的主题扩展映射在 components/editor/CodeEditor.tsx 内（仅编辑器分包引入 thememirror）。

export interface CodeThemeOption {
  id: string
  label: string
  dark: boolean
}

export const CODE_THEME_OPTIONS: CodeThemeOption[] = [
  { id: 'dracula', label: 'Dracula', dark: true },
  { id: 'cobalt', label: 'Cobalt', dark: true },
  { id: 'espresso', label: 'Espresso', dark: true },
  { id: 'coolGlow', label: 'Cool Glow', dark: true },
  { id: 'tomorrow', label: 'Tomorrow', dark: false },
  { id: 'solarizedLight', label: 'Solarized Light', dark: false },
]

export const DEFAULT_CODE_THEME = 'dracula'
