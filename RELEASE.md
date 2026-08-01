# CodeHelper v2.4.2 Release Notes

发布日期：2026-08-02

## 概览

v2.4.2 是一次面向桌面端可靠性和数据安全的维护版本。重点覆盖工作区恢复、AI 请求生命周期、代码运行器退出清理、IPC 防护和界面交互一致性。所有关键路径都经过单元测试、真实 Electron E2E 和生产构建验证。

## 主要更新

- 工作区和草稿恢复覆盖语言切换、光标/滚动位置、多窗口同步、标签拓扑、异常退出以及 renderer-only crash 场景。
- AI IPC 增加并发上限、流式 chunk 合并、取消竞态保护和会话切换隔离；网络抖动时不会清空已有会话列表。
- 代码运行 utility、Windows Job Host 和 Electron E2E teardown 均使用有界退出等待；Windows 强制终止后及时释放运行容量。
- 数据库记录实际 schema 指纹，schema 或迁移片段发生变化时先创建验证型迁移前备份。
- 生产环境隔离测试 hook 和 renderer 路径信任；未知资源包分类继续 fail-closed。
- 删除确认统一改用设计系统对话框，并补齐加载态、恢复提示、浅色主题可读性和通用 UI 组件。

## 修复

- 修复切换工作区语言可能替换当前代码的问题。
- 修复并发 AI 请求在取消、切换会话或删除会话时污染新会话消息的问题。
- 修复 utility / Job Host 清理等待无限挂起和 Windows 终止后并发槽位不归还的问题。
- 修复 Electron E2E teardown 卡死导致测试超时的问题；诊断采集和进程退出现在都有硬上限。

## 验证结果

- Vitest：149 个测试文件通过，2573 个测试通过，15 个跳过。
- Electron E2E：25/25 通过。
- `npm run lint`、`npm run format:check`、`npm run typecheck`、`npm run build`：全部通过。
- `npm audit --audit-level=high`：0 vulnerabilities。

## Windows 下载说明

正式 Windows Release 由 GitHub Actions 从发布 tag 重新构建并验证。Installer 和 Portable 包继续采用明确的未签名模式，Windows 可能显示“未知发布者”或 SmartScreen 提示。请只从本仓库 Release 下载，并使用随附的 `SHA256SUMS.txt` 校验文件完整性。

完整变更见 [CHANGELOG.md](https://github.com/TIANWEN-cpu/CodeHelper-Studio/blob/master/CHANGELOG.md)，开发和发布流程见 [README.md](https://github.com/TIANWEN-cpu/CodeHelper-Studio#readme)。
