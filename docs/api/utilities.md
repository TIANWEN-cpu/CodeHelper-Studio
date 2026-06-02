# 工具函数文档

本文档覆盖 `src/utils/` 目录下的所有工具函数，提供统一的错误处理、标签映射和编辑器配置能力。

---

## 目录

- [errors.ts — 错误处理工具](#errorsts--错误处理工具)
- [labels.ts — 标签映射工具](#labelsts--标签映射工具)
- [monacoConfig.ts — Monaco 编辑器配置](#monacoconfigts--monaco-编辑器配置)

---

## errors.ts — 错误处理工具

**文件位置：** `src/utils/errors.ts`

提供统一的错误规范化、分类和用户友好的错误消息生成。在渲染进程中全局使用。

### toErrorMessage

将任意 thrown 值规范化为可读字符串。

```typescript
function toErrorMessage(error: unknown): string
```

**参数：**

| 参数    | 类型      | 说明         |
| ------- | --------- | ------------ |
| `error` | `unknown` | 捕获的异常值 |

**返回值：** `string` — 错误信息文本。

**处理逻辑：**

| 输入类型                | 行为                       |
| ----------------------- | -------------------------- |
| `Error` 实例            | 返回 `error.message`       |
| `string`                | 原样返回                   |
| 含 `message` 属性的对象 | 返回 `String(obj.message)` |
| 其他                    | 返回 `String(error)`       |

**使用示例：**

```typescript
import { toErrorMessage } from '../utils/errors'

try {
  await window.api.invoke('problems-submit', args)
} catch (error) {
  const message = toErrorMessage(error)
  // message 可能是: "参数无效: code" 或 "题目不存在"
  showToast(message)
}
```

---

### safeAsync

安全执行异步操作，返回结果元组（类似 Go 的 `(value, error)` 模式）。

```typescript
async function safeAsync<T>(fn: () => Promise<T>): Promise<[T, null] | [null, Error]>
```

**参数：**

| 参数 | 类型               | 说明             |
| ---- | ------------------ | ---------------- |
| `fn` | `() => Promise<T>` | 要执行的异步函数 |

**返回值：**

- 成功时：`[data, null]`
- 失败时：`[null, Error]`

**使用示例：**

```typescript
const [data, err] = await safeAsync(() => window.api.invoke('chat-sessions-list'))
if (err) {
  console.error('加载会话失败:', err.message)
  return
}
// data 已安全可用
setSessions(data)
```

---

### safeSync

安全执行同步操作，返回结果元组。

```typescript
function safeSync<T>(fn: () => T): [T, null] | [null, Error]
```

**参数：**

| 参数 | 类型      | 说明             |
| ---- | --------- | ---------------- |
| `fn` | `() => T` | 要执行的同步函数 |

**返回值：**

- 成功时：`[data, null]`
- 失败时：`[null, Error]`

**使用示例：**

```typescript
const [parsed, err] = safeSync(() => JSON.parse(rawJson))
if (err) {
  console.error('JSON 解析失败:', err.message)
  return
}
// parsed 已安全可用
```

---

### parseJsonSafe

安全解析 JSON 字符串，失败时返回默认值。

```typescript
function parseJsonSafe<T>(raw: string, fallback: T): T
```

**参数：**

| 参数       | 类型     | 说明               |
| ---------- | -------- | ------------------ |
| `raw`      | `string` | JSON 字符串        |
| `fallback` | `T`      | 解析失败时的默认值 |

**返回值：** `T` — 解析结果或默认值。

**使用示例：**

```typescript
const tags: string[] = parseJsonSafe(problem.tags, [])
const config = parseJsonSafe<AppConfig>(rawConfig, defaultConfig)
```

---

### categorizeError

根据错误信息内容自动归类错误类型。

```typescript
type ErrorCategory = 'network' | 'validation' | 'auth' | 'not-found' | 'timeout' | 'unknown'

function categorizeError(error: unknown): ErrorCategory
```

**参数：**

| 参数    | 类型      | 说明         |
| ------- | --------- | ------------ |
| `error` | `unknown` | 捕获的异常值 |

**返回值：** `ErrorCategory` — 错误分类。

**分类规则：**

| 分类         | 匹配关键词                          |
| ------------ | ----------------------------------- |
| `network`    | `network`、`fetch`、`econnrefused`  |
| `auth`       | `unauthorized`、`401`、`403`        |
| `timeout`    | `timeout`、`timed out`              |
| `not-found`  | `not found`、`404`                  |
| `validation` | `invalid`、`validation`、`required` |
| `unknown`    | 以上均不匹配                        |

**使用示例：**

```typescript
const category = categorizeError(error)
if (category === 'auth') {
  navigate('/settings') // 引导用户检查 API Key 配置
} else if (category === 'network') {
  showRetryDialog()
}
```

---

### getUserMessage

获取用户友好的错误消息，优先使用原始错误信息，否则根据分类生成通用提示。

```typescript
function getUserMessage(error: unknown): string
```

**参数：**

| 参数    | 类型      | 说明         |
| ------- | --------- | ------------ |
| `error` | `unknown` | 捕获的异常值 |

**返回值：** `string` — 用户友好的错误消息。

**分类默认消息：**

| 分类         | 消息                               |
| ------------ | ---------------------------------- |
| `network`    | `'网络连接失败，请检查网络后重试'` |
| `auth`       | `'认证失败，请检查 API Key 配置'`  |
| `timeout`    | `'请求超时，请稍后重试'`           |
| `not-found`  | `'请求的资源不存在'`               |
| `validation` | `'输入数据不合法，请检查后重试'`   |
| `unknown`    | `'发生未知错误，请稍后重试'`       |

**使用示例：**

```typescript
// 当原始错误信息不够友好时，会回退到分类消息
const message = getUserMessage(error)
showToast(message)
```

---

## labels.ts — 标签映射工具

**文件位置：** `src/utils/labels.ts`

提供题目元数据（来源、平台、模式、学习路径、考试风格）的中文标签映射。在题目列表和详情页中使用。

### parseJsonArray

安全解析 JSON 数组字符串。

```typescript
function parseJsonArray(raw?: string): string[]
```

**参数：**

| 参数  | 类型                  | 说明            |
| ----- | --------------------- | --------------- |
| `raw` | `string \| undefined` | JSON 数组字符串 |

**返回值：** `string[]` — 解析结果，失败时返回空数组 `[]`。

**使用示例：**

```typescript
const tags: string[] = parseJsonArray(problem.tags) // '["数组","排序"]' -> ['数组', '排序']
const tracks: string[] = parseJsonArray(problem.tracks)
```

---

### sourceLabel

将题目来源标识转换为中文标签。

```typescript
function sourceLabel(source: string): string
```

**参数：**

| 参数     | 类型     | 说明     |
| -------- | -------- | -------- |
| `source` | `string` | 来源标识 |

**返回值：** `string` — 中文标签，未匹配时原样返回。

**标签映射表：**

| 标识                      | 中文标签       |
| ------------------------- | -------------- |
| `builtin`                 | 基础题库       |
| `leetcode`                | LeetCode       |
| `math-modeling`           | 原有建模题库   |
| `exam-retest-pat`         | 复试 PAT       |
| `exam-retest-pta`         | 复试 PTA       |
| `exam-retest-csp`         | 复试 CSP       |
| `summer-kattis`           | 夏令营 Kattis  |
| `summer-cf-gym`           | 夏令营 Gym     |
| `summer-uoj`              | 夏令营 UOJ     |
| `algo-job-nowcoder`       | 校招牛客       |
| `algo-job-oa`             | OA 模拟        |
| `ic-job-hdlbits`          | IC HDLBits     |
| `ic-job-nowcoder-verilog` | IC Verilog     |
| `ic-job-simulation`       | IC 仿真        |
| `modeling-official`       | 建模真题       |
| `modeling-kaggle`         | Kaggle 建模    |
| `modeling-mathworks`      | MathWorks 建模 |

---

### platformLabel

将平台标识转换为中文标签。

```typescript
function platformLabel(platform: string): string
```

**标签映射表：**

| 标识             | 中文标签       |
| ---------------- | -------------- |
| `pat`            | PAT            |
| `pta`            | PTA            |
| `csp`            | CSP            |
| `leetcode`       | LeetCode       |
| `nowcoder`       | 牛客           |
| `kattis`         | Kattis         |
| `cf-gym`         | Gym            |
| `uoj`            | UOJ            |
| `hackerrank`     | HackerRank     |
| `codesignal`     | CodeSignal     |
| `cumcm`          | 国赛           |
| `pgmcm`          | 研赛           |
| `mcm-icm`        | MCM/ICM        |
| `mathorcup`      | MathorCup      |
| `kaggle`         | Kaggle         |
| `mathworks`      | MathWorks      |
| `hdlbits`        | HDLBits        |
| `eda-playground` | EDA Playground |
| `internal`       | 内置           |

---

### modeLabel

将题目模式标识转换为中文标签。

```typescript
function modeLabel(mode: string): string
```

**标签映射表：**

| 标识          | 中文标签 |
| ------------- | -------- |
| `oj`          | OJ       |
| `simulation`  | 仿真题   |
| `data-task`   | 数据题   |
| `case-study`  | 案例题   |
| `report-task` | 报告题   |

---

### trackLabel

将学习路径标识转换为中文标签。

```typescript
function trackLabel(track: string): string
```

**标签映射表：**

| 标识              | 中文标签   |
| ----------------- | ---------- |
| `postgrad-retest` | 考研复试   |
| `summer-camp`     | 保研夏令营 |
| `algo-job`        | 算法校招   |
| `ic-job`          | 硬件 / IC  |
| `math-modeling`   | 数学建模   |

---

### examStyleLabel

将考试风格标识转换为中文标签。

```typescript
function examStyleLabel(style: string): string
```

**标签映射表：**

| 标识       | 中文标签 |
| ---------- | -------- |
| `acm`      | ACM      |
| `oa`       | OA       |
| `modeling` | 建模     |
| `hdl`      | HDL      |

---

## monacoConfig.ts — Monaco 编辑器配置

**文件位置：** `src/utils/monacoConfig.ts`

集中管理 Monaco Editor 的配置、主题映射和常用 Hook，确保所有编辑器实例共享一致的配置。

### defaultEditorOptions

所有 Monaco Editor 实例的默认选项。

```typescript
const defaultEditorOptions: Monaco.editor.IStandaloneEditorConstructionOptions
```

**配置项：**

| 选项                   | 值                         | 说明                 |
| ---------------------- | -------------------------- | -------------------- |
| `fontSize`             | `DEFAULT_EDITOR_FONT_SIZE` | 字体大小             |
| `fontFamily`           | `EDITOR_FONT_FAMILY`       | 字体族               |
| `minimap.enabled`      | `false`                    | 关闭小地图           |
| `padding.top`          | `12`                       | 顶部内边距           |
| `scrollBeyondLastLine` | `false`                    | 不滚动到最后一行之后 |
| `automaticLayout`      | `true`                     | 自动调整布局         |
| `tabSize`              | `EDITOR_TAB_SIZE`          | Tab 宽度             |
| `wordWrap`             | `'on'`                     | 自动换行             |
| `renderLineHighlight`  | `'line'`                   | 高亮当前行           |
| `cursorBlinking`       | `'smooth'`                 | 平滑光标动画         |
| `smoothScrolling`      | `true`                     | 平滑滚动             |

**使用示例：**

```typescript
import { defaultEditorOptions } from '../utils/monacoConfig'

<MonacoEditor
  options={{ ...defaultEditorOptions, readOnly: false }}
  language={tab.language}
  value={tab.content}
/>
```

---

### resolveMonacoTheme

将应用主题映射为 Monaco 编辑器主题名。

```typescript
function resolveMonacoTheme(theme: ThemeId): string
```

**参数：**

| 参数    | 类型      | 说明                                   |
| ------- | --------- | -------------------------------------- |
| `theme` | `ThemeId` | 应用主题标识（如 `'light'`、`'dark'`） |

**返回值：** `string` — Monaco 主题名。

---

### useActiveTab

自定义 Hook，返回当前激活的编辑器标签页。消除组件中重复的 `tabs.find(t => t.id === activeTabId)` 模式。

```typescript
function useActiveTab(): EditorTab | null
```

**返回值：** `EditorTab | null` — 当前标签页，无标签时返回 `null`。

**使用示例：**

```typescript
import { useActiveTab } from '../utils/monacoConfig'

function EditorView() {
  const tab = useActiveTab()
  if (!tab) return <EmptyState />
  return <MonacoEditor language={tab.language} value={tab.content} />
}
```

---

### useMonacoTheme

自定义 Hook，返回当前应用主题对应的 Monaco 主题名。

```typescript
function useMonacoTheme(): string
```

**返回值：** `string` — Monaco 主题名。

**使用示例：**

```typescript
import { useMonacoTheme } from '../utils/monacoConfig'

function MonacoEditor() {
  const theme = useMonacoTheme()
  return <Editor theme={theme} />
}
```

---

### 导出的额外成员

```typescript
export { registerMonacoThemes, monacoThemeByAppTheme } from '../theme/monacoThemes'
```

- `registerMonacoThemes`：注册自定义 Monaco 主题定义。
- `monacoThemeByAppTheme`：应用主题到 Monaco 主题的映射表。
