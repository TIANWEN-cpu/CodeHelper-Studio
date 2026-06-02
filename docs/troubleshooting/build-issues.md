# 构建问题排查

本文档专门收录与构建和打包相关的问题及解决方案。

## 开发构建

### Q: `npm run dev` 报错 "Cannot find module"

**排查步骤**：

```bash
# 1. 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 2. 运行 postinstall（编译 native 模块）
npm run postinstall

# 3. 重新启动
npm run dev
```

### Q: Vite 报 "Module parse failed"

**原因**：Vite 不认识的文件格式或语法。

**解决方案**：

```bash
# 检查 Vite 配置
cat electron.vite.config.ts

# 确认需要的 loader 已配置
# 常见问题：.svg 导入、.css 模块等
```

### Q: TypeScript 编译错误

```bash
# 运行类型检查
npm run typecheck

# 常见问题：
# 1. 导入的类型已更改
# 2. 新增的类型定义未导入
# 3. tsconfig 配置问题
```

检查 `tsconfig.json`、`tsconfig.web.json`、`tsconfig.node.json` 的配置是否正确。

### Q: ESLint 报错过多

```bash
# 自动修复
npm run lint:fix

# 如果仍有问题，检查 eslint.config.mjs 配置
cat eslint.config.mjs
```

### Q: Prettier 格式化冲突

```bash
# 检查配置
cat .prettierrc.json

# 运行格式化
npm run format

# 检查格式
npm run format:check
```

## 生产构建

### Q: `npm run build` 成功但 `npm run build:win` 失败

**排查步骤**：

```bash
# 1. 确认 build 成功
npm run build
ls out/

# 2. 检查 out/ 目录结构
ls out/main/     # 应有 index.mjs
ls out/preload/  # 应有 index.mjs
ls out/renderer/ # 应有 index.html

# 3. 检查 electron-builder 配置
cat electron-builder.yml

# 4. 查看详细错误
npm run build:win 2>&1 | head -100
```

### Q: 打包后应用启动报错 "Cannot find schema.sql"

**原因**：`schema.sql` 未正确打包到 resources 目录。

**解决方案**：

1. 检查 `electron-builder.yml` 的 `extraResources`：

```yaml
extraResources:
  - from: electron/db/schema.sql
    to: db/schema.sql
```

2. 检查 `electron/db/index.ts` 中的路径查找逻辑：

```typescript
const candidates = [
  join(process.resourcesPath, 'db', 'schema.sql'), // 打包后的路径
  join(__dirname, '../../electron/db/schema.sql'), // 开发路径
  join(__dirname, '../db/schema.sql'), // 备选路径
]
```

3. 打包后检查 `resources/db/schema.sql` 是否存在。

### Q: 打包后 native 模块加载失败

**原因**：better-sqlite3 的编译产物与目标 Electron 版本不匹配。

**解决方案**：

```bash
# 重新编译 native 模块
npm run postinstall

# 确认 electron-builder 配置中的 native 重编译
# electron-builder 会自动处理 native 模块的重编译
```

### Q: NSIS 安装程序生成失败

**排查**：

```bash
# 确认 NSIS 已安装（electron-builder 会自动下载）
# 检查防火墙/代理是否阻止了下载

# 手动下载 NSIS
# 设置环境变量
set ELECTRON_BUILDER_CACHE=C:\Users\%USERNAME%\.cache\electron-builder
```

### Q: macOS 构建需要签名

**说明**：macOS 应用需要 Apple Developer 证书才能正常分发。

```bash
# 设置签名证书
export CSC_LINK=path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password

# 设置公证（macOS 10.15+）
export APPLE_ID=your-apple-id
export APPLE_APP_SPECIFIC_PASSWORD=app-specific-password
export APPLE_TEAM_ID=your-team-id

npm run build:mac
```

如果只是本地测试，可以跳过签名：

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:mac
```

## CI/CD

### Q: GitHub Actions 构建失败

**常见原因**：

1. 依赖安装超时 → 配置 npm 缓存
2. Native 模块编译失败 → 确认 runner 有编译工具
3. 代码检查不通过 → 本地先运行 `npm run lint` 和 `npm run typecheck`

**检查步骤**：

1. 查看 GitHub Actions 日志
2. 在本地复现错误
3. 修复后推送

### Q: 标签推送后未触发 CI

**排查**：

```bash
# 确认标签格式正确（v 开头）
git tag -l

# 确认工作流配置
cat .github/workflows/release.yml

# 确认触发条件
# on:
#   push:
#     tags:
#       - 'v*'
```

## 清理与重建

当遇到无法解释的构建问题时，执行完整清理：

```bash
# 清除所有构建缓存
rm -rf out/
rm -rf dist-release/
rm -rf node_modules/.vite/
rm -rf node_modules/.cache/

# 重新安装
rm -rf node_modules package-lock.json
npm install
npm run postinstall

# 重新构建
npm run build
npm run package
```

---

## See Also

- [故障排除](../troubleshooting.md) -- 综合故障排除指南
- [常见问题](common-issues.md) -- 日常开发常见问题
- [性能优化](performance.md) -- 性能诊断与优化
- [构建与发布](../guides/deployment.md) -- 构建流程与配置
- [依赖审计报告](../dependency-audit.md) -- 依赖安全与过期审查
- [术语表](../glossary.md) -- 技术名词解释
