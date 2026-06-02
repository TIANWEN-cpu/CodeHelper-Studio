# 安全审计报告

> 审计日期：2026-06-02
> 审计范围：D:\codehelper 全面安全审计
> 审计内容：CSP、依赖 CVE、IPC 安全、Electron 安全配置

---

## 审计摘要

| 类别          | 发现数 | 严重  | 高危  | 中危  | 低危  | 信息  |
| ------------- | ------ | ----- | ----- | ----- | ----- | ----- |
| CSP 配置      | 2      | 0     | 0     | 0     | 1     | 1     |
| 依赖 CVE      | 4      | 2     | 0     | 2     | 0     | 0     |
| IPC 安全      | 4      | 0     | 0     | 1     | 2     | 1     |
| Electron 安全 | 2      | 0     | 0     | 0     | 1     | 1     |
| 代码执行沙箱  | 1      | 0     | 0     | 0     | 1     | 0     |
| **合计**      | **13** | **2** | **0** | **3** | **5** | **3** |

---

## 1. CSP (Content Security Policy) 审计

### 1.1 CSP 配置审查

**文件**：`electron/main.ts` 第 125-134 行

**当前策略**：

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data https:;
connect-src 'self' https:;
font-src 'self' data:;
```

**评估**：

| 指令                         | 状态          | 说明                                                         |
| ---------------------------- | ------------- | ------------------------------------------------------------ |
| `default-src 'self'`         | PASS          | 严格的默认策略，阻止未声明类型的跨源加载                     |
| `script-src 'self'`          | PASS          | 阻止所有内联 `<script>` 执行，核心 XSS 防御                  |
| `style-src 'unsafe-inline'`  | PASS (可接受) | Tailwind CSS 运行时需要内联样式，Electron 桌面应用下风险极低 |
| `img-src 'self' data https:` | PASS          | 允许 data URI 和 HTTPS 图片，范围合理                        |
| `connect-src 'self' https:`  | PASS          | AI 对话功能需要访问外部 API                                  |
| `font-src 'self' data:`      | PASS          | 仅允许本地和 data URI 字体                                   |

**注入方式**：通过 `onHeadersReceived` 拦截器为所有 HTTP 响应注入，覆盖面完整。

### FINDING-CSP-1 [LOW]：缺少 `base-uri` 和 `form-action` 指令

**说明**：未显式设置 `base-uri` 和 `form-action`，默认继承 `default-src 'self'`。在当前 Electron 桌面应用场景下影响极低，但显式声明可增强防御深度。

**建议**：在 CSP 字符串中追加 `base-uri 'self'; form-action 'self';`。

### FINDING-CSP-2 [INFO]：不需要 nonce-based 脚本加载

**说明**：在 Electron 应用中，所有内容通过 `file://` 协议加载，`script-src 'self'` 已足够限制脚本来源。不存在服务端动态生成 HTML 的场景，引入 nonce 机制只会增加复杂度而无实际安全收益。

**结论**：当前 CSP 配置符合最佳实践，无需修改。

---

## 2. 依赖 CVE 扫描

**扫描工具**：`npm audit --json`

### 漏洞总览

| 严重程度 | 数量  | 详情                                     |
| -------- | ----- | ---------------------------------------- |
| Critical | 2     | vitest、@vitest/coverage-v8              |
| Moderate | 2     | dompurify（通过 monaco-editor 间接依赖） |
| **合计** | **4** |                                          |

### FINDING-CVE-1 [CRITICAL]：vitest UI Server 任意文件读取

- **CVE**：GHSA-5xrq-8626-4rwp
- **CVSS**：9.8
- **影响包**：`vitest@3.2.6`、`@vitest/coverage-v8@3.2.6`
- **漏洞描述**：当 Vitest UI server 处于监听状态时，可读取并执行服务器上的任意文件
- **影响评估**：此漏洞仅在运行 `vitest --ui`（开发服务器）时可被利用。CI 环境仅使用 `vitest run`（无 UI server），生产环境不受影响
- **修复方案**：升级到 `vitest@>=4.1.0` + `@vitest/coverage-v8@>=4.1.0`（major 版本升级，需验证配置兼容性）
- **风险接受理由**：dev-only 漏洞，不影响生产构建产物。升级到 v4.x 需验证测试配置兼容性
- **行动项**：下次依赖升级周期中优先处理

### FINDING-CVE-2 [MODERATE]：dompurify 多个 XSS/原型污染漏洞

- **CVE 列表**：
  - GHSA-v2wj-7wpq-c8vv — XSS 漏洞 (CVSS 6.1)
  - GHSA-cjmm-f4jc-qw8r — ADD_ATTR 谓词跳过 URI 验证
  - GHSA-cj63-jhhr-wcxv — USE_PROFILES 原型污染
  - GHSA-39q2-94rc-95cp — ADD_TAGS 绕过 FORBID_TAGS
  - GHSA-h7mw-gpvr-xq4m — FORBID_TAGS 函数谓词绕过
  - GHSA-crv5-9vww-q3g8 — SAFE_FOR_TEMPLATES 绕过 (CVSS 6.8)
  - GHSA-v9jr-rg53-9pgp — CUSTOM_ELEMENT_HANDLING 原型污染 (CVSS 6.9)
  - GHSA-h8r8-wccr-v5f2 — Re-Contextualization mutation-XSS
- **影响路径**：`monaco-editor@0.55.1` -> `dompurify@<=3.3.3`
- **影响评估**：dompurify 仅在 Monaco Editor 内部用于 HTML 净化。CodeHelper 作为 Electron 桌面应用，无外部 HTML 输入场景，攻击面极其有限
- **修复方案**：等待 monaco-editor 升级 dompurify 依赖。`npm audit fix --force` 会降级 monaco-editor 到 0.53.0，属于破坏性降级，**不建议执行**
- **风险接受理由**：间接依赖，攻击面有限（桌面应用，无外部 HTML 输入），无可用安全补丁
- **行动项**：监控 monaco-editor 新版本发布

---

## 3. IPC 安全审计

### 3.1 预加载脚本 (preload.ts) 白名单

**状态**：PASS

- 通道白名单：31 个 invoke 通道 + 2 个 event 通道，全部明确枚举
- 序列化检查：`isSerializable()` 函数检查深度（最大 10 层），拒绝 function/symbol/bigint/自定义构造函数
- 暴露 API 最小化：仅 `invoke` 和 `on` 两个方法

### 3.2 IPC Handler 输入校验

逐个审查所有 IPC handler 的参数校验：

| Handler                    | 类型校验                 | 长度截断      | 数值范围             | 枚举校验        | 状态 |
| -------------------------- | ------------------------ | ------------- | -------------------- | --------------- | ---- |
| `db-get-setting`           | key: string              | 256           | -                    | -               | PASS |
| `db-set-setting`           | key+value: string        | 256+10000     | -                    | -               | PASS |
| `db-save-ai-config`        | 6 字段校验               | 200-2000      | -                    | -               | PASS |
| `db-delete-ai-config`      | id: number               | -             | isFinite, >=1        | -               | PASS |
| `ai-fetch-models`          | api_key+base_url: string | 2000          | -                    | -               | PASS |
| `ai-chat`                  | 4 字段校验               | 100000/200    | messages.length<=200 | role enum       | PASS |
| `run-code`                 | code+language: string    | 100000/50     | -                    | language 白名单 | PASS |
| `problems-list`            | filters: 7 个可选字段    | 100           | -                    | -               | PASS |
| `problems-get`             | id: number               | -             | isFinite, >=1        | -               | PASS |
| `problems-submit`          | 3 字段校验               | 100000/50     | problemId >=1        | -               | PASS |
| `problems-submissions`     | problemId: number        | -             | isFinite, >=1        | -               | PASS |
| `chat-session-create`      | id+title+system_prompt   | 200/500/10000 | -                    | -               | PASS |
| `chat-session-update`      | id+updates               | 200/500/10000 | -                    | -               | PASS |
| `chat-session-delete`      | id: string               | 200           | -                    | -               | PASS |
| `chat-messages-load`       | sessionId: string        | 200           | -                    | -               | PASS |
| `chat-message-save`        | 4 字段校验               | 200/100000    | -                    | role enum       | PASS |
| `chat-presets-list`        | 无参数                   | -             | -                    | -               | PASS |
| `chat-preset-save`         | 3 字段校验               | 200/10000     | id: isFinite, >=1    | -               | PASS |
| `chat-preset-delete`       | id: number               | -             | isFinite, >=1        | -               | PASS |
| `chat-memories-list`       | search: string (可选)    | 500           | -                    | -               | PASS |
| `chat-memory-save`         | 7 字段校验               | 100-1000      | id: isFinite, >=1    | -               | PASS |
| `chat-memory-delete`       | id: number               | -             | isFinite, >=1        | -               | PASS |
| `chat-memory-capture`      | content+session_id       | 10000/200     | -                    | -               | PASS |
| `knowledge-upload`         | dialog 系统对话框        | 10MB 文件限制 | -                    | 扩展名白名单    | PASS |
| `knowledge-list`           | 无参数                   | -             | -                    | -               | PASS |
| `knowledge-delete`         | id: number               | -             | isFinite, >=1        | -               | PASS |
| `knowledge-search`         | query: string            | 1000          | -                    | -               | PASS |
| `mistakes-list`            | 无参数                   | -             | -                    | -               | PASS |
| `mistakes-get`             | id: number               | -             | isFinite, >=1        | -               | PASS |
| `mistakes-update-analysis` | id+analysis              | 50000         | isFinite, >=1        | -               | PASS |
| `mistakes-delete`          | id: number               | -             | isFinite, >=1        | -               | PASS |
| `open-external`            | url: string              | 2000          | -                    | http/https only | PASS |
| `perf-get-ipc-stats`       | 无参数                   | -             | -                    | -               | PASS |

### 3.3 路径穿越检查

**状态**：PASS

- **knowledge-upload**：使用 Electron `dialog.showOpenDialog()` 系统文件选择器，用户无法注入路径。文件类型限制为 `.txt`、`.md`、`.pdf`
- **problems-sync**：读取路径为 `process.resourcesPath/problems` 和 `__dirname/../../resources/problems`，均为硬编码路径，无用户输入参与
- **codeRunner**：使用 UUID 命名临时文件，写入 `app.getPath('temp')/codehelper-run/` 目录，无路径穿越风险

### 3.4 SQL 注入检查

**状态**：PASS

- 所有 SQL 查询均使用 `better-sqlite3` 的 prepared statements + `?` 参数绑定
- `problems-list` 的 LIKE 查询使用 `params.push('%${filters.tag}%')`，参数化传递
- `knowledge-search` 的动态 WHERE 子句构建为 `keywords.map(() => 'LOWER(kc.content) LIKE ?')`，参数通过 `.all(...params)` 安全传递
- `chat-memories-list` 的 `markMemoriesUsed()` 使用 `ids.map(() => '?').join(',')` 构建 IN 子句，参数化绑定
- SQL 执行沙箱 (`codeRunner.runSql`) 使用 `:memory:` 独立数据库，与应用数据库完全隔离

### FINDING-IPC-1 [MEDIUM]：部分 IPC handlers 未应用中间件栈

**文件**：`electron/ipc/*.ts` 各处理器

**说明**：`open-external` 和 `perf-get-ipc-stats` 通过 `registerIpcHandler()` 注册，自动应用 `loggingMiddleware` + `errorMiddleware`。但其余 31 个 IPC handler 使用原生 `ipcMain.handle()` 注册，未经过中间件栈。

**影响**：

- 缺少统一的错误包装（错误消息直接暴露到渲染进程）
- 缺少统一的日志记录（无法追踪异常调用模式）
- 缺少速率限制（高频调用可能影响性能）

**建议**：将所有 `ipcMain.handle()` 调用迁移至 `registerIpcHandler()`，为高写入频率的 handler（如 `chat-message-save`、`ai-chat`）添加速率限制中间件。

### FINDING-IPC-2 [LOW]：`ai-fetch-models` 未验证 base_url 目标地址

**文件**：`electron/ipc/database.ts` 第 140-171 行

**说明**：`base_url` 仅验证了 `http:`/`https:` 协议，未阻止内网地址（如 `http://127.0.0.1`、`http://10.x.x.x`、`http://192.168.x.x`）。理论上可被利用进行 SSRF 探测内网服务。

**风险评估**：低。此功能本身设计为连接用户自有的 AI API 服务，且 Electron 桌面应用的攻击面（无外部网络输入）使得远程利用极不可能。

**建议**：如果需要加强防御，可在解析 URL 后检查 hostname 是否为保留 IP 地址段。

### FINDING-IPC-3 [LOW]：知识库上传错误消息暴露文件路径

**文件**：`electron/ipc/rag.ts` 第 31-33 行

**说明**：错误消息 `无法读取文件 "${filename}"` 和文件大小检查中的 `文件 "${filename}"` 使用了用户选择的文件名。在 Electron 桌面应用场景下风险极低，但暴露的路径信息可能泄露用户目录结构。

**建议**：在错误消息中仅显示文件名而非完整路径（当前实现已使用 `basename(filePath)`，实际上是安全的）。维持现状即可。

### FINDING-IPC-4 [INFO]：IPC 中间件未应用于高危 handler

**说明**：`db-save-ai-config`、`ai-chat`、`run-code`、`problems-submit` 等高影响力 handler 未通过 `registerIpcHandler()` 注册，因此缺少中间件栈的保护（日志、错误包装、速率限制）。

---

## 4. Electron 安全审计

### 4.1 webPreferences 加固

**文件**：`electron/main.ts` 第 108-122 行

| 选项                          | 设置值     | 评估                                           |
| ----------------------------- | ---------- | ---------------------------------------------- |
| `contextIsolation`            | `true`     | PASS - 渲染进程无法直接访问 Node.js API        |
| `nodeIntegration`             | `false`    | PASS - 禁用 Node.js 集成                       |
| `webSecurity`                 | `true`     | PASS - 启用同源策略                            |
| `navigateOnDragDrop`          | `false`    | PASS - 禁止拖拽导航                            |
| `sandbox`                     | 未显式设置 | INFO - Electron 20+ 默认为 false，建议显式设置 |
| `webviewTag`                  | 未显式设置 | INFO - 默认 false，建议显式设置为 false        |
| `allowRunningInsecureContent` | 未显式设置 | INFO - 默认 false，符合预期                    |
| `experimentalFeatures`        | 未显式设置 | INFO - 默认 false，符合预期                    |

### FINDING-ELEC-1 [LOW]：建议显式设置额外安全选项

**文件**：`electron/main.ts` 第 115-121 行

**说明**：以下选项虽有安全的默认值，但显式声明可防止 Electron 版本升级时默认值变更带来的安全回退：

```typescript
webPreferences: {
  // ...existing...
  sandbox: true,              // 显式启用沙箱
  webviewTag: false,          // 显式禁用 webview 标签
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
}
```

**注意**：启用 `sandbox: true` 可能影响 preload 脚本中的 `require` 使用。当前 preload.ts 仅使用 `contextBridge` 和 `ipcRenderer`，应该兼容。需进行回归测试。

### 4.2 导航攻击防御

**状态**：PASS

| 防御措施                                         | 实现位置        | 状态                                    |
| ------------------------------------------------ | --------------- | --------------------------------------- |
| `setWindowOpenHandler` 返回 `{ action: 'deny' }` | main.ts:165-179 | PASS - 阻止所有新窗口创建               |
| URL 协议白名单 (http/https only)                 | main.ts:168     | PASS - 阻止 file/javascript/data 等协议 |
| `navigateOnDragDrop: false`                      | main.ts:120     | PASS - 禁止拖拽导航                     |
| `shell.openExternal` 协议限制                    | main.ts:195-199 | PASS - 仅允许 http/https                |
| `shell.openExternal` 速率限制                    | main.ts:200-201 | PASS - 20 次/10 秒                      |

### 4.3 shell.openExternal 安全

**状态**：PASS

- `open-external` IPC handler 验证 URL 为字符串、非空、长度 <= 2000
- 使用 `new URL()` 解析，验证协议为 `http:` 或 `https:`
- 速率限制：20 次/10 秒窗口
- 菜单栏 "关于" 中的 `shell.openExternal(REPO_URL)` 使用硬编码的 GitHub URL，安全

### 4.4 原型污染防御

**状态**：PASS

**preload.ts** 中的 `isSerializable()` 函数：

- 检查 `obj.constructor`，拒绝非 `Object`/`Array` 构造函数的实例
- 深度限制为 10 层，防止深层嵌套栈溢出
- 拒绝 `function`、`symbol`、`bigint` 类型

**渲染进程 stores**：使用 Zustand 的 `set()` 函数进行不可变更新，不存在直接对象合并（`Object.assign`、展开运算符）到用户输入的风险。

### FINDING-ELEC-2 [INFO]：Electron Fuses 配置完整

**文件**：`scripts/after-pack.js`

已配置的 Fuses：

| Fuse                                    | 值    | 作用                             |
| --------------------------------------- | ----- | -------------------------------- |
| `RunAsNode`                             | false | 防止 `ELECTRON_RUN_AS_NODE` 攻击 |
| `EnableCookieEncryption`                | true  | 磁盘上加密 session cookies       |
| `EnableNodeOptionsEnvironmentVariable`  | false | 阻止 `NODE_OPTIONS` 注入         |
| `EnableNodeCliInspectArguments`         | false | 阻止生产环境 `--inspect` 调试    |
| `EnableEmbeddedAsarIntegrityValidation` | true  | 验证 asar 包完整性               |
| `OnlyLoadAppFromAsar`                   | true  | 强制仅从 asar 加载应用           |

**评估**：Fuses 配置符合 Electron 安全最佳实践，覆盖面完整。

---

## 5. 代码执行沙箱审计

### 5.1 codeRunner.ts 安全措施

**文件**：`electron/utils/codeRunner.ts`

| 安全措施       | 实现                                     | 状态 |
| -------------- | ---------------------------------------- | ---- |
| 语言白名单     | switch-case：python, c, cpp, csharp, sql | PASS |
| 并发控制       | MAX_CONCURRENT = 5                       | PASS |
| 执行超时       | 10000ms（compile: 10000ms）              | PASS |
| 输出大小限制   | MAX_OUTPUT_SIZE = 1MB                    | PASS |
| 临时文件命名   | `randomUUID()` 前缀                      | PASS |
| SQL 隔离       | `:memory:` 内存数据库                    | PASS |
| SQL 数据库关闭 | `finally { db.close() }`                 | PASS |
| 命令解析       | `resolveCommand()` + `where` 命令验证    | PASS |

### FINDING-SANDBOX-1 [LOW]：无 OS 级资源限制

**说明**：代码执行通过 `spawn()` 启动子进程，仅通过 Node.js 层面控制超时和并发。未使用操作系统级资源限制（如 Windows Job Objects 或 Linux cgroups）。

**影响**：在超时前的 10 秒窗口内，恶意代码可消耗大量 CPU/内存资源。

**风险评估**：低。这是桌面单用户应用，用户执行自己的代码，且 10 秒超时 + 5 并发限制提供了基本保护。

**建议**：如需加强，可考虑：

- Windows：使用 Job Objects 限制进程内存
- 设置 `spawn` 的 `maxBuffer` 选项
- 当前实现通过监听 stdout/stderr 长度检查已部分覆盖此风险

---

## 6. 修复建议汇总

### 立即行动（无代码变更）

| 编号 | 建议                           | 优先级 |
| ---- | ------------------------------ | ------ |
| -    | 当前实现无需立即修复的安全问题 | -      |

### 短期改进（下次迭代）

| 编号           | 建议                                                      | 优先级          |
| -------------- | --------------------------------------------------------- | --------------- |
| FINDING-IPC-1  | 将所有 IPC handler 迁移至 `registerIpcHandler()` 中间件栈 | MEDIUM          |
| FINDING-CVE-1  | 升级 vitest + @vitest/coverage-v8 到 v4.x                 | HIGH (dev-only) |
| FINDING-ELEC-1 | 显式设置 `sandbox: true` 等 webPreferences 选项           | LOW             |

### 长期跟踪

| 编号              | 建议                                         | 优先级 |
| ----------------- | -------------------------------------------- | ------ |
| FINDING-CVE-2     | 监控 monaco-editor 新版本获取 dompurify 修复 | LOW    |
| FINDING-IPC-2     | 评估是否需要阻止内网地址 SSRF                | LOW    |
| FINDING-SANDBOX-1 | 评估 OS 级资源限制的可行性                   | LOW    |

---

## 7. 风险接受记录

以下发现经评估后接受风险，不进行修复：

| 编号              | 发现                              | 风险接受理由                                                                           |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| FINDING-CVE-1     | vitest critical CVE (dev-only)    | 仅影响 `vitest --ui` 开发服务器，CI 和生产不受影响。升级为 breaking change，需单独排期 |
| FINDING-CVE-2     | dompurify moderate CVE (间接依赖) | 仅在 Monaco Editor 内部使用，桌面应用攻击面有限，无可用安全补丁                        |
| FINDING-IPC-2     | base_url SSRF                     | 设计功能为连接用户自有 AI API，Electron 桌面应用无远程攻击面                           |
| FINDING-SANDBOX-1 | 无 OS 级资源限制                  | 桌面单用户场景，10 秒超时 + 5 并发限制已提供基本保护                                   |

---

## 8. 安全优势总结

CodeHelper 在安全架构方面表现良好：

1. **多层防御**：contextIsolation + preload 白名单 + 参数校验 + CSP + Fuses
2. **输入校验全面**：所有 31 个 IPC handler 均有类型检查、长度截断和数值范围校验
3. **SQL 注入零风险**：全面使用 prepared statements，无字符串拼接 SQL
4. **路径穿越零风险**：无用户可控的文件路径参数
5. **导航攻击防御完整**：新窗口阻止 + 协议白名单 + 速率限制
6. **Electron Fuses 全面启用**：6 项安全 Fuse 全部正确配置
7. **API Key 加密**：使用 `safeStorage` 系统级加密，兼容无加密环境降级
8. **代码执行隔离**：语言白名单 + 并发控制 + 超时 + 输出限制 + 内存数据库

---

## See Also

- [安全模型](concepts/security-model.md) -- 安全架构详细说明
- [依赖审计报告](dependency-audit.md) -- 依赖版本和 CVE 详情
- [IPC 协议](developer-guide/ipc-protocol.md) -- IPC 通道定义和类型
- [架构文档](architecture.md) -- 整体架构与进程模型
