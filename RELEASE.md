# CodeHelper v2.1.0 Release Notes

## 概览

本次本地版本聚焦三件事：

1. **启动链路稳定性**：Electron main/preload/renderer 启动顺序更清晰，DB、schema、IPC 注册和 first-call 诊断信息可追踪。
2. **知识库 / RAG 路径健壮性**：将知识库 DB 初始化改为延迟加载，不再阻塞主启动流程；读操作可优雅降级，写操作带超时保护。
3. **前端可诊断性与安全边界**：App、Layout、main.tsx、index.html、preload、middleware、CSP、RAG tests 等关键路径进一步补齐日志与保护。

## 关键改进

### 启动与基础设施

- 优化 Electron 启动日志，覆盖 DB 连接、schema 加载、schema 执行、ensureSchemaColumns 完成。
- 在 renderer 启动流程中增加关键阶段日志，便于定位首次打开白屏问题。
- preload 与 runtimePaths 做进一步对齐，减少路径/加载异常带来的静默失败。

### RAG / Knowledge

- RAG 模块引入 deferred DB wrapper。
- 读接口在 DB 未就绪时返回 graceful empty payload，而不是阻塞或崩溃。
- 写接口（上传/删除等）使用带超时的 DB 获取路径，避免永久卡死。
- 补充 RAG IPC 测试用例，增强关键行为回归覆盖。

### IPC 与性能观测

- 在 database / problems / ai 等 IPC 注册路径增加 first-call 日志。
- 便于确认 renderer 首次使用哪些 IPC、是否卡在特定通道。
- 更容易区分“未调用”“首次调用失败”“重复调用异常”。

### 前端

- App / Layout / main.tsx / index.html 做进一步可读性与稳定性调整。
- main.css 增加少量样式辅助，用于当前前端壳层优化。

## 验证状态

- Vitest 测试：1477 passed
- 本次为本地发布笔记，用于记录当前工作区快照，不等价于云端 release 已发布。
