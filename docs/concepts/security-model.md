# 安全模型

本文档介绍 CodeHelper 的安全架构，涵盖 Electron 安全策略、API Key 加密、内容安全策略（CSP）以及代码执行沙箱。

## 安全架构概览

```
┌─────────────────────────────────────────────┐
│              安全层设计                        │
│                                             │
│  1. contextIsolation (Electron)              │
│     └─ 渲染进程无法直接访问 Node.js API       │
│                                             │
│  2. 白名单校验 (preload.ts)                   │
│     └─ 仅允许注册的 IPC 通道                   │
│                                             │
│  3. 参数校验 (ipc/*.ts)                       │
│     └─ 类型、长度、范围全面检查                 │
│                                             │
│  4. CSP 头 (main.ts)                         │
│     └─ 防止 XSS / 内联脚本                    │
│                                             │
│  5. API Key 加密 (safeStorage)               │
│     └─ 系统级加密存储敏感信息                   │
│                                             │
│  6. 代码执行限制 (codeRunner.ts)              │
│     └─ 并发数、超时、输出大小限制               │
└─────────────────────────────────────────────┘
```

## Electron 安全配置

### 窗口安全选项

```typescript
// electron/main.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.mjs'),
    contextIsolation: true, // 启用上下文隔离
    nodeIntegration: false, // 禁用 Node.js 集成
    webSecurity: true, // 启用 Web 安全策略
    navigateOnDragDrop: false, // 禁止拖拽导航
  },
})
```

各选项的安全意义：

| 选项                 | 值      | 安全作用                                                                                |
| -------------------- | ------- | --------------------------------------------------------------------------------------- |
| `contextIsolation`   | `true`  | 渲染进程运行在独立的 JavaScript 上下文中，无法直接访问 preload 脚本的变量或 Node.js API |
| `nodeIntegration`    | `false` | 渲染进程无法使用 `require()`、`process`、`fs` 等 Node.js API                            |
| `webSecurity`        | `true`  | 启用同源策略，阻止跨域请求                                                              |
| `navigateOnDragDrop` | `false` | 防止用户通过拖放文件触发页面导航                                                        |

### 外部链接安全

```typescript
// 限制外部导航到仅 http/https 协议
mainWindow.webContents.setWindowOpenHandler((details) => {
  try {
    const parsed = new URL(details.url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      shell.openExternal(details.url) // 安全协议，使用系统默认浏览器打开
    } else {
      console.warn(`[security] Blocked navigation to disallowed protocol: ${parsed.protocol}`)
    }
  } catch {
    console.warn(`[security] Blocked navigation to invalid URL: ${details.url}`)
  }
  return { action: 'deny' } // 始终阻止在应用内打开新窗口
})
```

`open-external` IPC 通道同样有严格校验：

```typescript
ipcMain.handle('open-external', (_event, url: string) => {
  if (typeof url !== 'string' || !url.trim()) throw new Error('参数无效: url')
  url = url.trim().slice(0, 2000) // 长度限制
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http/https 链接')
  }
  return shell.openExternal(url)
})
```

## Content Security Policy (CSP)

通过 `onHeadersReceived` 拦截器为所有 HTTP 响应注入 CSP 头：

```typescript
mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; " +
          "script-src 'self'; " + // 仅允许同源脚本，阻止内联脚本
          "style-src 'self' 'unsafe-inline'; " + // 允许内联样式（Tailwind 需要）
          "img-src 'self' data https:; " + // 允许 data URI 和 HTTPS 图片
          "connect-src 'self' https:; " + // 允许 HTTPS 连接（AI API 调用）
          "font-src 'self' data:;", // 允许 data URI 字体
      ],
    },
  })
})
```

CSP 策略要点：

- **script-src 'self'**：最关键，阻止所有内联 `<script>` 执行，防止 XSS
- **style-src 'unsafe-inline'**：Tailwind CSS 使用内联样式，必须允许
- **connect-src https:**：AI 聊天功能需要访问外部 API
- 未配置 `frame-src`，默认继承 `default-src 'self'`，阻止 iframe 注入

## IPC 安全层

### 预加载脚本白名单

`preload.ts` 是渲染进程与主进程之间的唯一桥梁。它实现多层安全检查：

**1. 通道白名单**

```typescript
const allowedInvokeChannels = new Set([
  'run-code',
  'db-get-setting',
  'db-set-setting',
  'db-get-ai-configs',
  'db-save-ai-config',
  'db-delete-ai-config',
  'ai-chat',
  'ai-fetch-models',
  'problems-list',
  'problems-get',
  'problems-submit',
  // ... 全部合法通道
])

const allowedEventChannels = new Set(['ai-chat-chunk', 'ai-chat-done'])
```

**2. 序列化检查**

```typescript
function isSerializable(value: unknown, depth = 0): boolean {
  if (depth > 10) return false // 防止深层嵌套导致栈溢出
  // 只允许基础类型、数组和纯对象
  // 拒绝 function、symbol、bigint、自定义类实例
}
```

**3. 暴露的 API**

仅暴露两个方法到 `window.api`：

- `invoke(channel, ...args)` — 请求-响应
- `on(channel, callback)` — 事件监听

## API Key 加密

AI 模型配置中的 API Key 使用 Electron 的 `safeStorage` API 进行系统级加密：

```typescript
// electron/ipc/database.ts

function encryptApiKey(apiKey: string): string {
  if (!safeStorage.isEncryptionAvailable()) return apiKey
  return 'enc:' + safeStorage.encryptString(apiKey).toString('base64')
}

function decryptApiKey(value: string): string {
  if (value.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64')).toString()
    } catch (err) {
      console.warn('decryptApiKey failed, data may be corrupted:', err)
      return ''
    }
  }
  return value // 未加密的旧数据
}
```

加密流程：

1. 保存时：`apiKey` -> `safeStorage.encryptString()` -> Base64 编码 -> 加 `enc:` 前缀 -> 存入 SQLite
2. 读取时：检查 `enc:` 前缀 -> 去前缀 -> Base64 解码 -> `safeStorage.decryptString()` -> 返回明文
3. 兼容处理：如果没有 `enc:` 前缀，视为未加密的旧数据直接返回

`safeStorage` 在不同平台使用不同的加密方式：

- **Windows**：DPAPI (Data Protection API)
- **macOS**：Keychain
- **Linux**：libsecret (GNOME Keyring / KWallet)

## 主进程参数校验

每个 IPC 处理器都执行严格的输入校验，防御模式如下：

```typescript
// 类型校验
if (!args || typeof args !== 'object') throw new Error('参数无效')
if (typeof args.code !== 'string') throw new Error('参数无效: code')

// 长度限制（防止 DoS）
args.code = args.code.slice(0, 100000) // 代码最长 100KB
args.language = args.language.trim().slice(0, 50) // 语言名最长 50 字符
args.content = args.content.slice(0, 100000) // 消息最长 100KB

// 数值范围校验
if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) {
  throw new Error('参数无效: id')
}

// 消息数量限制
if (args.messages.length > 200) throw new Error('消息数量超限')

// 枚举值校验
if (!['user', 'assistant', 'system'].includes(msg.role)) {
  throw new Error('参数无效: message role')
}
```

## 代码执行安全

`codeRunner.ts` 对用户代码执行有多重安全限制：

```typescript
const MAX_OUTPUT_SIZE = 1024 * 1024 // 输出最大 1MB
const MAX_CONCURRENT = 5 // 最多 5 个并发进程
const DEFAULT_TIMEOUT = 10000 // 默认超时 10 秒
```

限制措施：

1. **并发控制**：超过 5 个并发执行请求会直接拒绝
2. **超时控制**：执行超过 10 秒的进程会被 kill
3. **输出限制**：stdout/stderr 总量超过 1MB 时终止进程
4. **临时文件**：使用 UUID 命名的临时文件，避免冲突和信息泄露
5. **语言白名单**：仅支持 python、c、cpp、csharp、sql

```typescript
export async function runCodeSnippet(
  code: string,
  language: string,
  stdin?: string,
): Promise<CodeRunResult> {
  switch (language) {
    case 'python':
      return runPython(code, stdin)
    case 'c':
      return runCFamily(code, stdin, 'gcc')
    case 'cpp':
      return runCFamily(code, stdin, 'g++')
    case 'csharp':
      return runCSharp(code, stdin)
    case 'sql':
      return runSql(code) // 使用内存数据库
    default:
      return { stdout: '', stderr: `不支持的语言: ${language}`, exitCode: 1, stage: 'run' }
  }
}
```

SQL 执行使用内存数据库（`:memory:`），不影响应用数据：

```typescript
async function runSql(code: string): Promise<CodeRunResult> {
  const db = new Database(':memory:')
  try {
    const statements = splitSqlStatements(code)
    // 执行所有语句，最后一个查询语句返回结果集
    // ...
  } finally {
    db.close() // 确保关闭
  }
}
```

## Electron Fuses

构建配置中启用了 Electron Fuses，进一步加固安全：

```yaml
# electron-builder.yml
extends:
  - '@electron/fuses'
fuseOptions:
  EnableEmbeddedAsarIntegrityValidation: true
  OnlyLoadAppFromAsar: true
```

## 安全最佳实践

### 开发者注意事项

1. **永远不要**在渲染进程中使用 `nodeIntegration: true`
2. **始终通过** `typedInvoke` / `typedOn` 进行 IPC 通信
3. **添加新 IPC 通道时**必须同步更新 `preload.ts` 的白名单
4. **用户输入**必须在主进程中校验后才能使用
5. **敏感信息**（如 API Key）必须通过 `safeStorage` 加密
6. **不要信任**渲染进程发送的任何数据，始终做类型和范围校验

### 安全审计要点

- 检查 `preload.ts` 的白名单是否包含不必要的通道
- 检查各 IPC 处理器是否有遗漏的参数校验
- 检查 CSP 头是否过于宽松
- 检查 `safeStorage.isEncryptionAvailable()` 的降级处理

---

## See Also

- [系统架构](architecture.md) -- 整体架构与进程模型
- [IPC 通信模式](ipc-patterns.md) -- IPC 白名单与序列化检查的实现
- [数据流](data-flow.md) -- 数据流中的错误恢复机制
- [架构文档 - 安全模型](../architecture.md#安全模型) -- 安全特性概览
- [ADR-001: Electron 选型](../adr/001-electron-choice.md) -- Electron 安全特性
- [术语表](../glossary.md) -- CSP、contextIsolation 等术语解释
