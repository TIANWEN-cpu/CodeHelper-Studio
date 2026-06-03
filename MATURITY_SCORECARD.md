# MATURITY_SCORECARD.md

审计日期：2026-06-03  
项目路径：`D:\codehelper`  
评分范围：结合整体产品成熟度，但安全/AI 结论仅基于 AI Provider 集成、密钥存储、出站隐私/安全边界、provider 兼容性。

## 等级定义

- L1：原型，不稳定，仅能演示局部能力。
- L2：Alpha，核心链路存在但不完整，依赖人工绕路。
- L3：Beta，主要用户路径可用，但仍有发布/合规/兼容性短板。
- L4：生产可用，稳定、可维护、可发布，有基本商业化支撑。
- L5：规模化商业产品，具备企业级安全、运营、合规和增长体系。

## 成熟度评分

| 维度       | 评分 | 依据                                                                                                 | 升级到下一档的关键动作                                                                  |
| ---------- | ---: | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 功能完整性 |   L3 | 题库、编辑器、AI 对话、知识库、错题、统计、导入导出均已具备；但 AI Provider 兼容性和隐私控制不完整。 | 完成 Provider adapter、隐私控制中心、发布级设置向导。                                   |
| UX         |   L3 | AI 配置、模型选择、对话、记忆库路径可用；但 Provider 配置失败时解释成本高，发送哪些上下文不够透明。  | 增加配置诊断、发送预览、上下文开关、非技术用户引导。                                    |
| 技术架构   |   L3 | Electron 主/渲染分层、IPC 白名单、SQLite、本地状态管理清晰；但 Provider 层与密钥边界耦合在通用 IPC。 | 抽象 AI Provider service，隔离密钥读取，统一 URL 安全校验。                             |
| AI 能力    |   L3 | 支持 OpenAI-compatible streaming、RAG 上下文、长期记忆，是产品亮点。                                 | 支持 Anthropic/Gemini/Azure/Ollama 等 adapter，支持非 streaming fallback 和工具化评测。 |
| 可维护性   |   L3 | TypeScript、测试、模块分层较好；但 AI 协议逻辑集中在 IPC，未来扩 Provider 容易堆分支。               | 拆 Provider adapters、请求/错误/stream parser 单测矩阵。                                |
| 测试覆盖   |   L3 | 已有 Vitest、IPC、store、RAG 等测试；新鲜验证显示 typecheck/build/dev 可用。                         | 加 AI 安全边界测试、URL validator 测试、Provider mock 合约测试。                        |
| 文档质量   |   L3 | README/docs 目录完整，具备用户与开发文档基础。                                                       | 增加隐私白皮书、Provider 兼容矩阵、BYOK 风险说明、故障排查。                            |
| 可部署性   |   L3 | electron-builder、dist-release、build 脚本存在；新鲜 build 通过。                                    | 完成签名、自动更新、安装器 QA、崩溃恢复、发布流水线。                                   |
| 商业化     |   L2 | 产品价值明确，但无账号/授权/支付/隐私合规/组织能力。                                                 | 明确 BYOK 商业模式，增加 License、更新渠道、隐私政策、付费功能边界。                    |

## 总体评分

总体成熟度：L3-。

理由：核心学习产品与 AI 增强链路已经能跑通，适合 Beta 试用；但 AI Provider 出站边界、密钥暴露面、隐私发送透明度和商业化基础仍未达到 L4。

## 关键风险对应分数影响

- AI Provider 出站边界未限制 HTTPS/私网：压低技术架构、安全发布和商业化评分。
- API Key 明文返回渲染层：压低 AI 能力产品化与技术架构评分。
- Provider 兼容性单一：压低功能完整性和 UX。
- 缺少隐私发送预览：压低 UX、商业化和发布信任度。

## 最短升级路径

1. 先修 `D:\codehelper\electron\ipc\database.ts` 与 `D:\codehelper\electron\ipc\ai.ts` 的 URL 校验和出站边界。
2. 改造 `db-get-ai-configs`，渲染层只拿 masked key，不拿明文 key。
3. 增加 Provider adapter 层和 OpenAI-compatible/Anthropic/Gemini/Ollama 最小矩阵。
4. 在 `D:\codehelper\src\modules\settings\SettingsView.tsx` 和 `D:\codehelper\src\modules\ai-chat\ChatView.tsx` 增加上下文发送开关与预览。
5. 补充 Provider mock 测试、安全边界测试和发布文档。
