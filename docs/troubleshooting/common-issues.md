# 常见问题

本文档收录 CodeHelper 开发和使用中的常见问题及解决方案。

## 环境搭建

### Q: npm install 报错 node-gyp 编译失败

**原因**：better-sqlite3 是 native 模块，需要 C++ 编译工具链。

**解决方案**：

```bash
# Windows：安装构建工具
npm install -g windows-build-tools

# 或手动安装 Visual Studio Build Tools
# 下载地址：https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 安装 "使用 C++ 的桌面开发" 工作负载

# 安装后重新编译
npm run postinstall
```

### Q: 应用启动后白屏

**可能原因**：

1. 渲染进程代码有编译错误
2. Node.js 版本不兼容

**排查步骤**：

```bash
# 1. 检查 TypeScript 错误
npm run typecheck

# 2. 检查 Node.js 版本
node -v  # 需要 18.x+

# 3. 清除构建缓存
rm -rf out/ node_modules/.vite
npm run dev
```

### Q: Python 代码无法运行

**原因**：系统 PATH 中没有 `python` 命令。

**解决方案**：

```bash
# 检查 Python
python --version

# 如果没有，安装 Python 并添加到 PATH
# Windows: https://www.python.org/downloads/
# 安装时勾选 "Add Python to PATH"
```

## 开发

### Q: 修改 electron/ 下的文件后没有热更新

**原因**：electron-vite 的热更新仅支持渲染进程（src/），主进程代码需要重启。

**解决方案**：修改 `electron/` 下的文件后，按 `Ctrl+C` 终止 dev server 然后重新 `npm run dev`。

### Q: 状态更新但 UI 不刷新

**原因**：Zustand 使用引用相等比较。如果返回了同一个引用，组件不会重渲染。

**解决方案**：

```typescript
// 不好：filter 每次返回新数组引用，但如果用在选择器外就不会触发重渲染
const filtered = useStore((s) => s.items.filter((x) => x.active))
// 每次 store 任何状态变化都会创建新数组

// 好：在组件中用 useMemo 缓存
const items = useStore((s) => s.items)
const filtered = useMemo(() => items.filter((x) => x.active), [items])
```

### Q: IPC 调用报 "不允许的 IPC 调用" 错误

**原因**：新增的 IPC 通道未在 `preload.ts` 的白名单中注册。

**解决方案**：在 `electron/preload.ts` 的 `allowedInvokeChannels` 集合中添加新通道名。

```typescript
const allowedInvokeChannels = new Set([
  // ... 现有通道
  'my-new-channel', // 添加新通道
])
```

### Q: TypeScript 类型错误 "window.api 不存在"

**原因**：需要声明全局类型。

**解决方案**：在 `src/env.d.ts` 中确认有以下声明：

```typescript
interface Window {
  api: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  }
}
```

## 数据库

### Q: "database is locked" 错误

**原因**：SQLite 数据库被锁，通常是长时间运行的写事务导致。

**解决方案**：

1. 确认 WAL 模式已启用（`db/index.ts` 中的 `pragma('journal_mode = WAL')`）
2. 避免长时间事务，尽快提交
3. 不要同时打开多个数据库连接

### Q: 数据库文件在哪里？

```bash
# Windows
%APPDATA%/codehelper/codehelper.db

# macOS
~/Library/Application Support/codehelper/codehelper.db

# Linux
~/.config/codehelper/codehelper.db
```

### Q: 如何重置数据库？

删除数据库文件后重启应用，会自动重新创建。

```bash
# Windows
del "%APPDATA%\codehelper\codehelper.db"

# 重启应用
npm run dev
```

## AI 对话

### Q: "未配置AI模型" 错误

**原因**：没有在设置中添加 AI 模型配置。

**解决方案**：

1. 打开应用 → 设置
2. 添加 AI 配置（API Key、Base URL、模型名）
3. 保存后重试

### Q: AI 响应非常慢

**可能原因**：

1. 网络延迟
2. API 提供商限速
3. 消息上下文过长

**排查**：

1. 检查终端的性能监控日志：`[perf] Slow IPC "ai-chat": xxxxms`
2. 减少对话历史长度
3. 尝试其他 AI 提供商

### Q: 流式响应乱序或丢失

**原因**：可能同时发起了多个请求。

**排查**：chatStore 使用 `requestId` 匹配机制。检查是否有多个组件同时调用 `sendMessage`。

## 构建

### Q: electron-builder 打包失败

**排查步骤**：

```bash
# 1. 确认 build 成功
npm run build

# 2. 检查构建输出
ls out/

# 3. 检查 electron-builder 配置
cat electron-builder.yml

# 4. 清除打包缓存
rm -rf dist-release
npm run build:win
```

### Q: 打包后 schema.sql 找不到

**原因**：`extraResources` 配置不正确。

**解决方案**：检查 `electron-builder.yml` 中的 `extraResources` 配置：

```yaml
extraResources:
  - from: electron/db/schema.sql
    to: db/schema.sql
```

## 性能

### Q: 应用启动慢

**排查**：

1. 检查是否有大量初始数据加载
2. 确认 Monaco Editor 是否懒加载
3. 查看终端的性能监控日志

### Q: 编辑器卡顿

**可能原因**：

1. 文件内容过大
2. 频繁的自动保存
3. 大量标签页同时打开

**解决方案**：

1. 减少同时打开的标签页数量
2. 关闭不需要的编辑器功能（minimap 等）

---

## See Also

- [故障排除](../troubleshooting.md) -- 综合故障排除指南
- [构建问题排查](build-issues.md) -- 构建与打包故障
- [性能优化](performance.md) -- 性能诊断与优化
- [FAQ.md](../../FAQ.md) -- 用户常见问题
- [术语表](../glossary.md) -- 技术名词解释
