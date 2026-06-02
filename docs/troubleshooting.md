# 故障排除

本文档汇总 CodeHelper 使用和开发过程中可能遇到的常见问题及其解决方案。

## 安装问题

### npm install 超时或失败

**症状**: `npm install` 命令长时间无响应或报网络错误。

**解决方案**:

```bash
# 使用国内 npm 镜像
npm config set registry https://registry.npmmirror.com

# 重新安装
npm install
```

或临时使用镜像：

```bash
npm install --registry https://registry.npmmirror.com
```

### better-sqlite3 编译失败

**症状**: 安装过程中出现 `better-sqlite3` 相关的编译错误。

**原因**: `better-sqlite3` 是原生 C++ 模块，需要系统安装编译工具链。

**解决方案**:

| 操作系统 | 安装步骤                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，选择"使用 C++ 的桌面开发"工作负载 |
| macOS    | 运行 `xcode-select --install`                                                                                                   |
| Linux    | 运行 `sudo apt install build-essential python3`                                                                                 |

安装后清除缓存重新编译：

```bash
rm -rf node_modules
npm install
```

### Electron 下载失败

**症状**: `npm install` 时 Electron 二进制文件下载失败。

**解决方案**:

```bash
# 设置 Electron 镜像
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

或在 `.npmrc` 中永久配置：

```
electron_mirror=https://npmmirror.com/mirrors/electron/
```

### Node.js 版本过低

**症状**: 各种语法错误或依赖安装失败。

**解决方案**: 确保 Node.js 版本 >= 18。

```bash
node --version
```

建议使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node.js 版本：

```bash
nvm install 20
nvm use 20
```

## 启动问题

### Electron 窗口白屏

**症状**: 应用启动后显示空白窗口。

**排查步骤**:

1. 检查运行 `npm run dev` 的终端是否有编译错误
2. 按 `Ctrl+Shift+I` 打开 DevTools，查看 Console 中的错误信息
3. 尝试清除缓存重建：

```bash
rm -rf node_modules out
npm install
npm run dev
```

4. 确认 Node.js 版本 >= 18

### 开发服务器启动报错

**症状**: `npm run dev` 启动时出现错误。

**排查步骤**:

1. 检查错误信息中的具体文件和行号
2. 运行类型检查：`npm run typecheck`
3. 运行 lint 检查：`npm run lint`
4. 如有端口冲突，检查是否有其他实例在运行

## API 连接问题

### AI 对话无法使用

**症状**: 发送消息后提示错误或无响应。

**排查步骤**:

1. **检查 API 配置**: 进入设置模块，确认已添加并正确配置了 AI 模型
   - API Key 是否正确
   - Base URL 是否正确（不含 `/chat/completions` 路径）
   - 模型名称是否正确

2. **测试网络连通性**: 在 DevTools 控制台中执行：

   ```javascript
   window.api
     .invoke('ai-fetch-models', {
       api_key: 'your-key',
       base_url: 'your-url',
     })
     .then(console.log)
     .catch(console.error)
   ```

3. **检查 API 服务可用性**: 部分服务可能需要网络代理
   - OpenAI: 某些地区需要代理
   - 本地 Ollama: 确认服务正在运行（`ollama serve`）

4. **检查 API Key 有效性**: 确认账户有足够额度

### 获取模型列表失败

**症状**: 设置中点击获取模型列表时报错。

**可能原因**:

- API Key 无效或已过期
- Base URL 地址错误
- 网络无法访问目标服务
- 服务不支持 `/models` 接口

**解决方案**: 手动在模型输入框中输入模型名称即可。

### 流式输出中断

**症状**: AI 回复到一半后停止。

**可能原因**:

- 网络不稳定
- API 服务端超时
- 消息内容过长

**解决方案**:

- 检查网络连接
- 尝试缩短输入消息
- 重新发送消息

## 代码运行器问题

### "找不到命令" 错误

**症状**: 运行代码时提示找不到 python/gcc/java 等命令。

**解决方案**: 确保对应语言的编译器/运行时已安装并在系统 PATH 中：

```bash
# 测试各语言是否可用
python --version
gcc --version
javac -version
dotnet --version
```

| 语言   | 安装指南                                                                      |
| ------ | ----------------------------------------------------------------------------- |
| Python | [python.org](https://www.python.org/downloads/)                               |
| C/C++  | Windows: MinGW-w64; macOS: `xcode-select --install`; Linux: `build-essential` |
| Java   | [Adoptium](https://adoptium.net/)                                             |
| C#     | [dotnet.microsoft.com](https://dotnet.microsoft.com/download)                 |

### 代码执行超时

**症状**: 运行代码后长时间无响应，最终提示超时。

**原因**: 代码运行器有 10 秒超时限制。

**解决方案**:

- 检查代码中是否有死循环
- 优化算法效率
- 对于确实需要长时间运行的代码，考虑本地运行

### 输出被截断

**症状**: 程序输出不完整。

**原因**: 代码运行器有 1MB 的输出大小限制。

**解决方案**: 减少输出量，或分段运行。

### 并发执行限制

**症状**: 提示"并发执行数量已达上限"。

**原因**: 同时最多运行 5 个进程。

**解决方案**: 等待当前运行的进程完成后再执行新的代码。

## 编辑器问题

### Monaco Editor 加载缓慢

**症状**: 编辑器区域长时间显示加载中。

**原因**: Monaco Editor 首次加载需要下载语言包文件。

**解决方案**:

- 首次加载较慢是正常现象，后续会使用缓存
- 确保网络连接正常

### 代码高亮不正确

**症状**: 代码显示为纯文本，没有语法高亮。

**排查步骤**:

1. 检查编辑器是否正确识别了语言类型
2. 尝试切换语言模式
3. 重启应用

## 数据问题

### 题目列表为空

**症状**: 刷题页面没有显示任何题目。

**排查步骤**:

1. 检查 `resources/problems/` 目录下是否有 JSON 文件
2. 查看 Main 进程终端是否有同步错误日志
3. 检查数据库文件是否损坏（尝试删除数据库文件后重启）

### 错题本没有记录

**症状**: 提交错误代码后错题本没有新增记录。

**排查步骤**:

1. 确认提交的代码确实被判定为失败（非 accepted）
2. 查看 Main 进程终端是否有错误日志
3. 使用 DB Browser 检查 `mistakes` 表

### 知识库导入失败

**症状**: 导入文档时提示错误。

**可能原因**:

- 文件超过 10MB 大小限制
- PDF 文件加密或损坏
- 文件格式不受支持

**解决方案**:

- 减小文件大小
- 检查 PDF 文件是否可以正常打开
- 确保文件扩展名为 `.txt`、`.md` 或 `.pdf`

## 构建打包问题

### electron-builder 打包失败

**症状**: `npm run build:win` 失败。

**排查步骤**:

1. 确保已先运行 `npm run build`（`out/` 目录存在）
2. 检查 `electron-builder.yml` 配置
3. 查看详细错误日志

### 安装包无法运行

**症状**: 生成的 exe 文件双击后无反应或报错。

**可能原因**:

- 被杀毒软件误拦截
- 缺少运行时依赖

**解决方案**:

- 将应用添加到杀毒软件白名单
- 使用免安装版（`win-unpacked/CodeHelper.exe`）测试

### 构建体积过大

**症状**: 安装包文件异常大。

**排查步骤**:

1. 运行 `npm run build:analyze` 分析 bundle 大小
2. 检查 `node_modules` 中是否有不需要的依赖
3. 确认 `resources/` 目录中没有多余的大型文件

## 性能问题

### 应用启动慢

**可能原因**:

- 首次启动需要同步题库数据到数据库
- Monaco Editor 首次加载

**解决方案**:

- 首次启动较慢是正常现象，后续启动会使用数据库缓存
- 确保系统有足够的内存

### 数据库操作缓慢

**可能原因**:

- 数据库文件过大
- 查询没有使用索引

**解决方案**:

- 检查数据库文件大小
- 使用 `perf-get-ipc-stats` 查看慢操作
- 考虑清理不需要的数据（如旧的聊天记录）

### AI 响应延迟高

**可能原因**:

- 网络延迟（尤其使用海外 API 服务时）
- 模型本身响应慢
- 输入消息过长

**解决方案**:

- 选择延迟较低的 API 服务
- 使用更快的模型（如 gpt-4o-mini）
- 控制对话历史长度（最多 200 条）

## 获取帮助

如果以上方案都无法解决问题：

1. 查看 [GitHub Issues](https://github.com/TIANWEN-cpu/CodeHelper/issues) 中是否有类似问题
2. 提交新的 Issue，提供以下信息：
   - 操作系统和版本
   - Node.js 版本
   - 详细的错误信息
   - 复现步骤
3. 在 [GitHub Discussions](https://github.com/TIANWEN-cpu/CodeHelper/discussions) 中提问

---

## See Also

- [FAQ.md](../FAQ.md) -- 用户常见问题速查
- [常见问题 (docs)](troubleshooting/common-issues.md) -- 开发者常见问题
- [构建问题排查](troubleshooting/build-issues.md) -- 构建与打包故障详解
- [性能优化](troubleshooting/performance.md) -- 性能诊断与优化策略
- [性能预算](performance-budgets.md) -- 关键操作性能目标
- [架构文档](architecture.md) -- 系统架构与安全模型
- [API 参考](api.md) -- IPC 通道与数据库 Schema
- [CONTRIBUTING.md](../CONTRIBUTING.md) -- 开发环境搭建与调试技巧
