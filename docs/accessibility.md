# Accessibility (a11y) Guide for CodeHelper

CodeHelper follows WCAG 2.1 AA guidelines to ensure the application is usable by everyone, including people who rely on assistive technologies.

## Landmarks and Page Structure

The application uses semantic HTML landmarks to help screen readers and keyboard users navigate:

- **Skip-to-content link**: A visually hidden link appears on first `Tab` press, allowing users to jump directly to the main content area, bypassing the sidebar navigation.
- **`<nav>`**: The sidebar navigation is wrapped in a `<nav aria-label="主导航">` element.
- **`<main>`**: The primary content area uses `<main id="main-content">`. It receives `tabIndex={-1}` so the skip-to-content link can programmatically focus it.
- **`role="status"`**: The status bar at the bottom of the screen uses `role="status"` to announce connection and running state changes to screen readers.

## Keyboard Navigation

### Global Shortcuts

| Shortcut       | Action               |
| -------------- | -------------------- |
| `Ctrl+Shift+P` | Open Command Palette |
| `Ctrl+Shift+F` | Open Global Search   |
| `Ctrl+N`       | New AI chat session  |
| `Ctrl+Enter`   | Run code in editor   |
| `Ctrl+S`       | Save current file    |

### Sidebar Navigation

- All sidebar buttons are focusable and support `Tab` navigation.
- The currently active module is announced via `aria-current="page"`.
- Sidebar collapse/expand buttons use `aria-expanded` to indicate state.
- Visible focus rings (`focus-visible:ring-2`) are applied to all interactive elements.

### Modals and Dropdowns

- **Command Palette** (`Ctrl+Shift+P`): Supports `Arrow Up/Down` for navigation, `Enter` to execute, and `Escape` to close. Uses `role="dialog"`, `aria-modal="true"`, and `aria-activedescendant` for the selected item.
- **Global Search** (`Ctrl+Shift+F`): Same keyboard pattern as Command Palette. Uses `role="dialog"` and `aria-modal="true"`.
- **Session Preset Menu**: Closes on `Escape` key. Uses `aria-expanded` and `aria-haspopup` on the trigger button.

### Tabs (Editor)

- Editor tabs use `role="tablist"` and `role="tab"` with `aria-selected` to indicate the active tab.
- Close buttons on tabs use `aria-label="关闭 <filename>"`.
- New tab button uses `aria-label="新建文件"`.

### Toggle Buttons

- Minimap, split editor, and terminal toggles use `aria-pressed` to communicate their on/off state.
- Filter chips in ProblemList and GlobalSearch use `aria-pressed` for the active state.

## ARIA Attributes

### Labels

- All icon-only buttons have `aria-label` attributes describing their action.
- All decorative icons use `aria-hidden="true"` to be ignored by screen readers.
- Form inputs have explicit `aria-label` attributes (search fields, textarea for chat, terminal input).
- Select dropdowns (AI config, programming language) have `aria-label` attributes.

### Live Regions

- **Toast notifications**: The toast container uses `role="status"` with `aria-live="polite"` and `aria-relevant="additions"`. Error toasts use `role="alert"` for immediate announcement.
- **AI chat messages**: The message list uses `role="log"` with `aria-live="polite"`.
- **Console/Terminal output**: Uses `role="log"` with `aria-live="polite"`.
- **Status bar running indicator**: Uses `aria-live="polite"` for streaming/running status.
- **AI typing indicator**: Uses `role="status"` with `aria-label="AI 正在回复"`.

### Dialogs

- Command Palette: `role="dialog"`, `aria-modal="true"`, `aria-label="命令面板"`
- Global Search: `role="dialog"`, `aria-modal="true"`, `aria-label="全局搜索"`
- Command list uses `role="listbox"` with `role="option"` and `aria-selected` on each item.

### Dynamic Content

- **Error boundaries**: Use `role="alert"` to announce errors.
- **Empty states**: Use `role="status"`.
- **Loading spinners**: Use `role="status"` with `aria-label="加载中"`.
- **Error with retry**: Uses `role="alert"`.
- **Submit results**: The output panel uses `role="log"` with `aria-live="polite"`.
- **Stats charts**: SVG line chart uses `role="img"` with `aria-label`. Activity calendar uses `role="grid"`.

## Color Contrast

All three themes (Mocha, Fjord, Ember) have been designed with WCAG AA contrast ratios in mind:

- **Primary text** (`--theme-text-primary`) on app background (`--theme-bg-app`): contrast ratio >= 7:1 (AAA)
- **Secondary text** (`--theme-text-secondary`): contrast ratio >= 4.5:1 (AA)
- **Muted text** (`--theme-text-muted`): used only for supplementary information; contrast ratio >= 3:1
- **Accent on dark backgrounds**: meets AA large text requirements
- **Status colors** (success, warning, danger, info): chosen for distinguishability on dark backgrounds

## Reduced Motion

The application respects the `prefers-reduced-motion: reduce` media query:

- All CSS animations (`animate-spin`, `animate-pulse`, typing dots, status pulse) are disabled.
- Transition durations are set to `0.01ms` (effectively instant).
- Sidebar collapse transition is disabled.

## High Contrast Mode

The application supports Windows High Contrast Mode (`forced-colors: active`):

- Buttons use `ButtonText` border color.
- Cards use `CanvasText` border color.

## Screen Reader Support

### Semantic Roles

- Navigation: `role="navigation"` on sidebar
- Main content: `<main>` landmark
- Logs: `role="log"` for chat messages, console output, terminal output, and submit results
- Status: `role="status"` for toasts, loading states, empty states, typing indicator
- Alert: `role="alert"` for error toasts and error boundaries
- Tabs: `role="tablist"` / `role="tab"` for editor tabs
- Dialogs: `role="dialog"` with `aria-modal` for overlays
- Lists: `role="listbox"` / `role="option"` for command palette results

### Form Labels

All form inputs have accessible names via one or more of:

- `aria-label` attribute
- Associated `<label>` element (SettingsView Field component)
- `placeholder` text (supplementary only, not relied upon as sole label)

## Files Changed

### src/components/

- `Layout.tsx` -- Skip-to-content link, `<nav>`, `<main>` landmark
- `Sidebar.tsx` -- `role="navigation"`, `aria-label`, `aria-current`, `aria-expanded`, focus-visible rings
- `CommandPalette.tsx` -- `role="dialog"`, `aria-modal`, `aria-activedescendant`, `role="listbox"/"option"`
- `Toast.tsx` -- `role="alert"` for errors, `aria-relevant`, `aria-hidden` on icons
- `LoadingSpinner.tsx` -- `role="status"`, `aria-label`, sr-only text
- `StatusBar.tsx` -- `role="status"`, `aria-label`, `aria-live` on running indicator, `aria-hidden` on icons
- `EmptyState.tsx` -- `role="status"`, `aria-hidden` on icon
- `ErrorWithRetry.tsx` -- `role="alert"`, `aria-hidden` on icons, focus-visible ring
- `ErrorBoundary.tsx` -- Already had `role="alert"` (no changes needed)

### src/modules/ai-chat/

- `ChatView.tsx` -- `role="log"`, `aria-live`, `aria-label` on textarea/send/select, `aria-hidden` on icons
- `MessageBubble.tsx` -- `aria-hidden` on avatar icons, `role="status"` on typing indicator
- `SessionList.tsx` -- `aria-label` on all icon buttons, `aria-expanded`/`aria-haspopup` on preset menu, Escape key handler, `aria-hidden` on icons

### src/modules/editor/

- `EditorView.tsx` -- `aria-pressed` on toggle buttons, `aria-label` on all toolbar buttons, `aria-hidden` on icons
- `EditorTabs.tsx` -- `role="tablist"`/`role="tab"`, `aria-selected`, `aria-label` on close/new buttons, `aria-hidden` on icons
- `Console.tsx` -- `role="log"`, `aria-label`, `aria-live`
- `TerminalPanel.tsx` -- `role="separator"` on resize handle, `role="log"`, `aria-live`, `aria-label` on all buttons/input, `aria-hidden` on icons
- `MonacoEditor.tsx` -- No changes needed (Monaco handles its own accessibility)

### src/modules/problems/

- `ProblemList.tsx` -- `aria-label` on search/collapse buttons, `aria-pressed` on filter chips, `aria-hidden` on icons
- `ProblemDetail.tsx` -- `aria-label` on all toolbar buttons, `aria-pressed` on AI toggle, `role="log"` on output panel, `aria-live`, `aria-hidden` on icons
- `AISidebar.tsx` -- `aria-label` on close/send buttons, `role="log"` on message area, `aria-live`, `aria-hidden` on icons
- `ProblemsView.tsx` -- No changes needed (structural only)

### src/modules/mistakes/

- `MistakesView.tsx` -- `aria-label` on retry/delete buttons, `aria-hidden` on icons

### src/modules/knowledge/

- `KnowledgeView.tsx` -- `aria-label` on delete buttons and search input, `aria-hidden` on icons

### src/modules/stats/

- `StatsView.tsx` -- `role="img"` with `aria-label` on SVG chart, `role="group"` on stat cards, `role="grid"` on activity calendar, `aria-hidden` on icons

### src/modules/settings/

- `SettingsView.tsx` -- No structural changes needed (already uses `<label>` elements via Field component)

### src/modules/search/

- `GlobalSearch.tsx` -- `role="dialog"`, `aria-modal`, `aria-label` on search/close buttons, `aria-pressed` on filter buttons, `aria-hidden` on icons

### src/assets/

- `main.css` -- Added `.sr-only` utility, `focus:not-sr-only` for skip link, global `*:focus-visible` outline, `prefers-reduced-motion` support, `forced-colors` (high contrast) support

### src/index.html

- No changes needed (already has `lang="zh-CN"`)
