interface ContentSecurityPolicyOptions {
  isPackaged: boolean
  rendererUrl?: string
}

function isLocalDevRenderer(rendererUrl?: string): boolean {
  if (!rendererUrl) return false
  try {
    const parsed = new URL(rendererUrl)
    return (
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())
    )
  } catch {
    return false
  }
}

export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const devRenderer = !options.isPackaged && isLocalDevRenderer(options.rendererUrl)

  if (devRenderer) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*",
      "font-src 'self' data:",
    ].join('; ')
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https:",
    "font-src 'self' data:",
  ].join('; ')
}
