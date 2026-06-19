/**
 * 出站 Base URL 安全校验：防止主进程被用作 SSRF / 内网探测代理。
 *
 * 规则：
 * - 回环地址（127.0.0.0/8、::1、localhost）显式允许，作为本机 Ollama/LocalAI 的逃生通道，
 *   http/https 均可。
 * - 其余地址必须为 HTTPS。
 * - 拒绝一切私网 / 链路本地 / 元数据 / 唯一本地（ULA）地址，覆盖 IPv4 与 IPv6，
 *   并拒绝十进制/十六进制等非点分整数形式的 IP 伪装。
 */

/** 将点分十进制 IPv4 解析为 4 段数字；非合法点分形式返回 null。 */
function parseDottedIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    octets.push(n)
  }
  return octets as [number, number, number, number]
}

/** 是否为回环 IPv4（127.0.0.0/8）。 */
function isLoopbackIPv4(octets: [number, number, number, number]): boolean {
  return octets[0] === 127
}

/** 是否为应拒绝的私网 / 保留 IPv4（不含回环，回环单独允许）。 */
function isBlockedIPv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets
  if (a === 0) return true // 0.0.0.0/8 "this network"
  if (a === 10) return true // 10.0.0.0/8 私网
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true // 169.254.0.0/16 链路本地（含 169.254.169.254 元数据）
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 私网
  if (a === 192 && b === 168) return true // 192.168.0.0/16 私网
  if (a === 192 && b === 0) return true // 192.0.0.0/24 与 192.0.2.0/24 保留
  if (a >= 224) return true // 多播 224/4 与保留 240/4
  return false
}

/**
 * 规范化 IPv6（去掉 zone id，处理 IPv4-mapped）。返回小写、无方括号的字符串。
 */
function normalizeIPv6(host: string): string {
  let h = host
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  const zoneIdx = h.indexOf('%')
  if (zoneIdx >= 0) h = h.slice(0, zoneIdx)
  return h.toLowerCase()
}

/** 是否为 IPv6（含简写）。 */
function looksLikeIPv6(host: string): boolean {
  return host.includes(':')
}

/** 是否为应拒绝/特殊处理的 IPv6（回环单独返回，供 http 逃生通道判断）。 */
function classifyIPv6(host: string): 'loopback' | 'blocked' | 'public' {
  const h = normalizeIPv6(host)

  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return 'loopback'
  if (h === '::' || h === '0:0:0:0:0:0:0:0') return 'blocked' // 未指定地址

  // IPv4-mapped（::ffff:x）。URL 会把点分形式规范化为十六进制（::ffff:7f00:1），两种都要覆盖。
  const mappedDotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  let mappedV4: [number, number, number, number] | null = null
  if (mappedDotted) {
    mappedV4 = parseDottedIPv4(mappedDotted[1])
  } else if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    mappedV4 = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]
  }
  if (mappedV4) {
    if (isLoopbackIPv4(mappedV4)) return 'loopback'
    if (isBlockedIPv4(mappedV4)) return 'blocked'
    return 'public'
  }

  // fc00::/7 唯一本地（ULA）：首字节 fc 或 fd
  if (/^f[cd]/.test(h)) return 'blocked'
  // fe80::/10 链路本地
  if (/^fe[89ab]/.test(h)) return 'blocked'

  return 'public'
}

export function assertAllowedProviderBaseUrl(baseUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error('参数无效: base_url')
  }

  // 去掉可能的尾随点（DNS 绝对名绕过），统一小写
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')

  const blockedMessage = '不允许访问该 Base URL：拒绝私网或元数据地址'
  const protocolMessage =
    '不允许访问该 Base URL：请使用 HTTPS 公网地址，或显式使用本机 Ollama/LocalAI 地址'

  // 判定回环 / 阻断状态
  let isLoopback = host === 'localhost' || host === 'localhost.localdomain'
  let isBlocked = host.endsWith('.local')

  const dotted = parseDottedIPv4(host)
  if (dotted) {
    if (isLoopbackIPv4(dotted)) isLoopback = true
    else if (isBlockedIPv4(dotted)) isBlocked = true
  } else if (looksLikeIPv6(host)) {
    const kind = classifyIPv6(host)
    if (kind === 'loopback') isLoopback = true
    else if (kind === 'blocked') isBlocked = true
  }

  // 协议：回环允许 http/https；其余强制 https
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    throw new Error(protocolMessage)
  }

  if (isBlocked) {
    throw new Error(blockedMessage)
  }

  return parsed.toString().replace(/\/$/, '')
}
