# 构建与发布

> **[< 上一页: 调试指南](debugging.md)** | **[下一页: 贡献指南 >](contributing.md)**

本文档介绍 CodeHelper 的构建流程、版本管理和发布策略。

## 构建系统

CodeHelper 使用 **electron-vite** 作为构建工具，结合 **electron-builder** 进行打包。

### 构建流程

```
源代码
  │
  ├─ electron-vite build（编译 TypeScript → JavaScript）
  │   ├─ 主进程: electron/ → out/main/
  │   ├─ 预加载: electron/preload.ts → out/preload/
  │   └─ 渲染进程: src/ → out/renderer/
  │
  └─ electron-builder（打包为平台安装包）
      ├─ Windows: .exe (NSIS) / .msi
      ├─ macOS: .dmg / .zip
      └─ Linux: .AppImage / .deb / .rpm
```

### 构建命令

```bash
# 仅编译（不打包）
npm run build

# 构建 + 打包（当前平台）
npm run package

# 构建 + 打包（指定平台）
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux

# 构建分析（查看包大小）
npm run build:analyze
```

## electron-builder 配置

配置文件：`electron-builder.yml`

```yaml
appId: com.tianwen.codehelper
productName: CodeHelper
directories:
  output: dist-release
files:
  - out/**/*
extraResources:
  - from: electron/db/schema.sql
    to: db/schema.sql
win:
  target:
    - target: nsis
      arch: [x64]
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
extends:
  - '@electron/fuses'
fuseOptions:
  EnableEmbeddedAsarIntegrityValidation: true
  OnlyLoadAppFromAsar: true
```

关键配置说明：

| 配置项           | 说明                                |
| ---------------- | ----------------------------------- |
| `appId`          | 应用唯一标识符，用于系统级注册      |
| `productName`    | 显示的应用名称                      |
| `extraResources` | 额外打包的资源文件（如 schema.sql） |
| `nsis`           | Windows NSIS 安装程序选项           |
| `fuseOptions`    | Electron Fuses 安全选项             |

## 版本管理

### 版本号规则

使用语义化版本（Semantic Versioning）：`MAJOR.MINOR.PATCH`

- **MAJOR**：不兼容的 API 变更
- **MINOR**：新增功能（向后兼容）
- **PATCH**：Bug 修复（向后兼容）

### 版本升级脚本

```bash
# 补丁版本升级 (1.0.0 → 1.0.1)
npm run release:patch

# 次要版本升级 (1.0.0 → 1.1.0)
npm run release:minor

# 主要版本升级 (1.0.0 → 2.0.0)
npm run release:major
```

版本升级脚本 (`scripts/version-bump.js`) 会：

1. 更新 `package.json` 中的 `version` 字段
2. 运行 `npm run build` 编译
3. 运行 `npm run package` 打包

## CI/CD

### GitHub Actions

项目使用 GitHub Actions 自动化构建和发布。

**工作流文件**：`.github/workflows/release.yml`

**触发条件**：

- 推送以 `v` 开头的标签（如 `v1.0.0`）
- 手动触发（workflow_dispatch）

**构建矩阵**：

- Windows (windows-latest)
- macOS (macos-latest)
- Linux (ubuntu-latest)

### 发布流程

```bash
# 1. 更新 CHANGELOG.md
vim CHANGELOG.md

# 2. 提交变更
git add .
git commit -m "chore: prepare release v1.1.0"

# 3. 打标签
git tag v1.1.0

# 4. 推送标签触发 CI
git push origin v1.1.0
```

CI 会自动：

1. 在三个平台上构建
2. 生成安装包
3. 创建 GitHub Release
4. 上传构建产物

## 构建优化

### 代码分割

渲染进程使用 Vite 的代码分割功能。`Layout.tsx` 中的各模块视图可以考虑使用 `React.lazy` 进行懒加载：

```typescript
const EditorView = lazy(() => import('./modules/editor/EditorView'))
const ChatView = lazy(() => import('./modules/ai-chat/ChatView'))
```

### 包大小分析

```bash
# 生成包大小分析报告
npm run build:analyze
```

分析报告会显示各模块的大小，帮助识别过大的依赖。

### Tree Shaking

Vite 内置 Tree Shaking 支持。确保：

1. 使用 ES Module 格式的依赖
2. 避免副作用（side effects）
3. 在 `package.json` 中声明 `"sideEffects": false`（如适用）

## 环境变量

| 变量                    | 用途                               | 设置位置               |
| ----------------------- | ---------------------------------- | ---------------------- |
| `ELECTRON_RENDERER_URL` | 开发模式下渲染进程的 URL           | electron-vite 自动设置 |
| `NODE_ENV`              | 运行环境（development/production） | 构建工具自动设置       |

## 跨平台注意事项

### Windows

- 使用 NSIS 安装程序
- 支持自定义安装路径
- 注册开始菜单快捷方式

### macOS

- 生成 DMG 和 ZIP 格式
- 需要 Apple Developer 签名才能分发
- 签名和公证命令：

```bash
# 签名
export CSC_LINK=path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password
npm run build:mac
```

### Linux

- 生成 AppImage（免安装）
- 生成 deb 和 rpm 包
- 依赖系统级 SQLite 库

## 故障排查

### 构建失败

**问题**：`electron-vite build` 报错

**排查**：

1. 确认 `npm install` 已成功
2. 运行 `npm run typecheck` 检查 TypeScript 错误
3. 运行 `npm run lint` 检查 ESLint 错误
4. 清除 `out/` 和 `dist-release/` 目录后重试

**问题**：native 模块编译失败

**解决**：

```bash
# 安装 Windows 构建工具
npm install -g windows-build-tools

# 重新编译 native 模块
npm run postinstall
```

**问题**：打包后 schema.sql 找不到

**排查**：

1. 确认 `electron-builder.yml` 中的 `extraResources` 配置正确
2. 检查 `electron/db/schema.sql` 文件是否存在
3. 检查打包后的 `resources/db/schema.sql` 路径

---

## See Also

- [快速上手](getting-started.md) -- 环境搭建与依赖安装
- [调试指南](debugging.md) -- 构建问题排查方法
- [构建问题排查](../troubleshooting/build-issues.md) -- 构建与打包故障详解
- [依赖审计报告](../dependency-audit.md) -- 依赖安全与过期审查
- [性能预算](../performance-budgets.md) -- 打包体积与性能目标
- [ADR-001: Electron 选型](../adr/001-electron-choice.md) -- Electron 框架决策
- [CHANGELOG.md](../../CHANGELOG.md) -- 版本变更日志
