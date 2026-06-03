export function assertAllowedProviderBaseUrl(baseUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error('参数无效: base_url')
  }

  const host = parsed.hostname.toLowerCase()
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1'

  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    throw new Error(
      '不允许访问该 Base URL：请使用 HTTPS 公网地址，或显式使用本机 Ollama/LocalAI 地址',
    )
  }

  const blockedHosts = new Set(['0.0.0.0', '169.254.169.254'])
  if (blockedHosts.has(host) || host.endsWith('.local')) {
    throw new Error('不允许访问该 Base URL：拒绝私网或元数据地址')
  }

  if (
    /^(10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error('不允许访问该 Base URL：拒绝私网或元数据地址')
  }

  return parsed.toString().replace(/\/$/, '')
}
