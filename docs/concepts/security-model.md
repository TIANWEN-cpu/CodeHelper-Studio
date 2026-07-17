# 安全模型

本文档介绍 CodeHelper 的安全架构，涵盖 Electron 安全策略、API Key 加密、内容安全策略（CSP）以及本地代码执行边界。

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
│  6. 本地受控执行 (codeRunner.ts)              │
│     └─ utility 进程、资源限制、进程树清理        │
└─────────────────────────────────────────────┘
```

## Electron 安全配置

### 窗口安全选项

```typescript
// electron/main.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: getPreloadScriptPath(__dirname), // electron-vite 输出 index.js
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

`setWindowOpenHandler` 只处理新窗口。当前主窗口尚未注册 `will-navigate` 等顶级导航拦截，因此
不能把这一段称为完整导航防御；该开放发现见 [安全审计 SEC-001](../security-audit.md)。

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
export const allowedInvokeChannels = new Set([
  'run-code',
  'runner-detect-toolchains',
  'db-get-setting',
  'ai-chat',
  'knowledge-retrieval-status',
  'agent-tools-list',
  // ... 当前共 113 个显式 invoke 通道
])

export const allowedEventChannels = new Set([
  'app-before-close',
  'ai-chat-chunk',
  'ai-chat-done',
  'editor-workspace-changed',
])
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
// electron/utils/apiKeyStorage.ts

function encryptApiKey(apiKey: string): string {
  const storageBackend =
    process.platform === 'linux' ? safeStorage.getSelectedStorageBackend?.() : undefined
  if (!safeStorage.isEncryptionAvailable() || storageBackend === 'basic_text') {
    throw new Error('Secure API key storage is unavailable on this system')
  }
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
- **Linux**：libsecret（GNOME Keyring / KWallet）；若 Electron 只能使用 `basic_text` backend，
  新保存会 fail-closed

## 主进程参数校验

每个 IPC 处理器都**必须**执行严格输入校验。当前合同矩阵会检查通道是否连接，但不能替代逐个
Handler 的安全审计；防御模式如下：

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

本地代码执行是 **受控运行，不是强隔离沙箱**。非 SQL 代码先进入一次性 Electron
utility 进程；Windows x64 必须在原生 Job Host 返回 `READY`、确认 utility 已加入 Job
Object 后才会收到用户代码。SQL 使用独立的 SQLite utility 进程和内存数据库。

```typescript
const MAX_OUTPUT_SIZE = 1024 * 1024 // 输出最大 1MB
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 单轮临时目录总量 50MB
const MAX_CONCURRENT = 5 // 最多 5 个并发进程
const DEFAULT_TIMEOUT = 10000 // 默认超时 10 秒
```

非 SQL 限制措施：

1. **并发控制**：超过 5 个并发执行请求会直接拒绝；槽位在 utility 与 Job Host 真实退出后才释放
2. **超时控制**：执行超过 10 秒时终止进程树
3. **输出限制**：stdout/stderr 合计超过 1 MB 时终止进程树
4. **目录配额**：每轮递归监控 50 MB 与 20,000 个目录项；不跟随符号链接或 junction，扫描失败时保守终止
5. **Windows Job Object**：最多 32 个活动进程、单进程 384 MB、整个 Job 768 MB，并启用 kill-on-close；正常收尾会等待 Job 活动进程归零，异常强杀路径依赖 kill-on-close
6. **POSIX 尽力清理**：用 `ulimit` 限制文件大小；Python/C/C++/Mono 另尝试限制地址空间，Node 仅限制 V8 old-space，dotnet 没有进程内存上限；通过独立进程组终止后代
7. **语言白名单**：仅支持 Python、C、C++、C#、JavaScript/Node.js 与 SQL

SQL 不进入 Windows Job，也不使用非 SQL 临时目录配额。它在独立 SQLite utility 的内存
数据库中执行，限制为 3 秒、256 KB 输入、100 条语句、1000 行结果、512 KB 格式化输出和
64 KB/单元格；SQLite 支持时还会尝试设置 128 MB `hard_heap_limit`。

Windows Job Object 是资源与生命周期容器，不是 AppContainer。macOS/Linux 没有严格 RSS
上限，`ulimit` 与进程组也不是 cgroup 或容器。本地受控路径中的代码都以当前用户身份运行，仍能访问当前用户
有权限访问的文件和网络；POSIX 后代还可能通过建立新 session 逃离原进程组。

### Docker 强隔离（可选）

当探测到 Docker daemon 与 `dockerRunner` 中固定 digest 的镜像时，UI 可将
`strongIsolationAvailable` 设为 `true`。强隔离路径：

1. **容器边界**：`--network none`、`--read-only`、`--cap-drop ALL`、`no-new-privileges`、非 root
2. **资源限制**：CPU、内存、PID（C# 128，其他 32）、1 MB 输出、10 秒超时
3. **清理**：`--cidfile` 记录容器 ID；超时或输出超限时 `docker rm -f`，并依赖 `--rm`
4. **Fail-closed**：daemon/镜像不可用时拒绝强隔离请求，不退回本地执行
5. **SQL 策略**：SQL 仅在本地受控的内存 SQLite utility 中运行，强隔离请求对 SQL 直接拒绝

即使用户选择强隔离，也应优先运行可信代码；镜像需用户授权预先拉取，应用不会自动 `docker pull`。

## Electron Fuses

打包后的 `after-pack` 脚本启用 Electron Fuses，进一步加固安全：

```typescript
// scripts/after-pack.js
await flipFuses(executablePath, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
})
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
- [安全审计报告](../security-audit.md) -- 当前开放发现、依赖和发布边界
