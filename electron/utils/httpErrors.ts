/**
 * 将上游 AI Provider 的 HTTP 错误状态码映射为对用户友好、且不泄露上游响应体细节的提示。
 * 详细响应体只写入本地日志用于诊断，不回传渲染层。
 */
export type UpstreamContext = 'chat' | 'models'

export function friendlyUpstreamError(status: number, context: UpstreamContext): string {
  const scope = context === 'models' ? '获取模型列表失败' : 'AI 请求失败'
  switch (status) {
    case 400:
      return `${scope}：请求格式不被该 Provider 接受 (400)，请检查模型名是否正确`
    case 401:
    case 403:
      return `${scope}：鉴权失败 (${status})，API Key 无效或无访问权限`
    case 404:
      return `${scope}：接口不存在 (404)，请检查 Base URL（是否缺少 /v1 等路径）`
    case 408:
      return `${scope}：上游请求超时 (408)`
    case 429:
      return `${scope}：请求过于频繁或额度不足 (429)，请稍后再试`
    default:
      if (status >= 500) return `${scope}：Provider 服务异常 (${status})，请稍后再试`
      return `${scope} (${status})`
  }
}

/** 标准化的重定向阻止错误：出于 SSRF 防护拒绝跟随上游重定向。 */
export function redirectBlockedError(context: UpstreamContext): Error {
  const scope = context === 'models' ? '获取模型列表' : 'AI 请求'
  return new Error(
    `出于安全考虑，已阻止${scope}过程中的重定向。请在设置中直接填写最终的 HTTPS Base URL。`,
  )
}

/** 判断响应是否为重定向（配合 redirect:'manual' 使用）。 */
export function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}
