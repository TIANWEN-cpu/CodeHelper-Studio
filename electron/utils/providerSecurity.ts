import { lookup } from 'dns/promises'
import { isIP } from 'net'

export interface ResolvedProviderTarget {
  url: string
  address: string
  family: 4 | 6
  addresses: Array<{ address: string; family: 4 | 6 }>
}

export type ProviderResolver = (host: string) => Promise<Array<{ address: string; family: number }>>

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
  const [a, b, c] = octets
  if (a === 192 && b === 88 && c === 99) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a === 192 && b === 0 && c !== 0 && c !== 2) return false
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

function parseIPv6Hextets(host: string): number[] | null {
  let normalized = normalizeIPv6(host)
  const dottedMatch = normalized.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dottedMatch) {
    const dotted = parseDottedIPv4(dottedMatch[1])
    if (!dotted) return null
    const high = (dotted[0] << 8) | dotted[1]
    const low = (dotted[2] << 8) | dotted[3]
    normalized = `${normalized.slice(0, -dottedMatch[1].length)}${high.toString(16)}:${low.toString(16)}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const parts = halves.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
  return parts.map((part) => Number.parseInt(part, 16))
}

/** 是否为 IPv6（含简写）。 */
function looksLikeIPv6(host: string): boolean {
  return host.includes(':')
}

/** 是否为应拒绝/特殊处理的 IPv6（回环单独返回，供 http 逃生通道判断）。 */
function classifyIPv6(host: string): 'loopback' | 'blocked' | 'public' {
  const h = normalizeIPv6(host)
  const hextets = parseIPv6Hextets(h)
  if (!hextets) return 'blocked'

  const allZero = hextets.every((part) => part === 0)
  const loopback = hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1
  if (loopback) return 'loopback'
  if (allZero) return 'blocked'

  const mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff
  const compatible = hextets.slice(0, 6).every((part) => part === 0)
  if (mapped || compatible) {
    const embedded: [number, number, number, number] = [
      (hextets[6] >> 8) & 0xff,
      hextets[6] & 0xff,
      (hextets[7] >> 8) & 0xff,
      hextets[7] & 0xff,
    ]
    if (isLoopbackIPv4(embedded)) return 'loopback'
    return isBlockedIPv4(embedded) ? 'blocked' : 'public'
  }

  const [first, second] = hextets
  if ((first & 0xe000) !== 0x2000) return 'blocked'
  if (first === 0x2001 && second === 0x0000) return 'blocked'
  if (first === 0x2001 && second === 0x0002) return 'blocked'
  if (first === 0x2001 && ((second & 0xfff0) === 0x0010 || (second & 0xfff0) === 0x0020))
    return 'blocked'
  if (first === 0x2001 && second === 0x0db8) return 'blocked'
  if (first === 0x2002 || first === 0x3ffe || (first & 0xfff0) === 0x3ff0) return 'blocked'

  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return 'loopback'
  if (/^f[cd]/.test(h) || /^fe[89a-f]/.test(h) || /^ff/.test(h)) return 'blocked'
  if (/^100:/.test(h) || /^64:ff9b:1:/.test(h)) return 'blocked'
  if (/^2001:(?:0|2|10|20|db8):/.test(h) || /^2002:/.test(h) || /^3ffe:/.test(h)) return 'blocked'
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

  const firstHextet = Number.parseInt(h.split(':', 1)[0], 16)
  if (!Number.isInteger(firstHextet) || (firstHextet & 0xe000) !== 0x2000) return 'blocked'

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
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('参数无效: base_url 不得包含凭据、查询参数或片段')
  }

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

function isBlockedResolvedAddress(address: string): boolean {
  const dotted = parseDottedIPv4(address)
  if (dotted) return isLoopbackIPv4(dotted) || isBlockedIPv4(dotted)
  if (looksLikeIPv6(address)) return classifyIPv6(address) !== 'public'
  return true
}

export async function resolveAllowedProviderTarget(
  baseUrl: string,
  resolveHost: ProviderResolver = (host) => lookup(host, { all: true, verbatim: true }),
  resolutionTimeoutMs = 10_000,
): Promise<ResolvedProviderTarget> {
  const normalized = assertAllowedProviderBaseUrl(baseUrl)
  const parsed = new URL(normalized)
  const host = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')

  const literalFamily = isIP(host)
  if (literalFamily === 4 || literalFamily === 6) {
    return {
      url: normalized,
      address: host,
      family: literalFamily,
      addresses: [{ address: host, family: literalFamily }],
    }
  }

  let addresses: Array<{ address: string; family: number }>
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    addresses = await Promise.race([
      resolveHost(host),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('AI Provider DNS resolution timed out')),
          resolutionTimeoutMs,
        )
      }),
    ])
  } catch {
    throw new Error('鏃犳硶瑙ｆ瀽 AI Provider 鍩熷悕')
  } finally {
    if (timeout) clearTimeout(timeout)
  }
  const isLocalhost = host === 'localhost' || host === 'localhost.localdomain'
  const invalidAddress = addresses.some((entry) => {
    if (entry.family !== 4 && entry.family !== 6) return true
    if (isLocalhost) {
      const dotted = parseDottedIPv4(entry.address)
      return dotted ? !isLoopbackIPv4(dotted) : classifyIPv6(entry.address) !== 'loopback'
    }
    return isBlockedResolvedAddress(entry.address)
  })
  if (addresses.length === 0 || invalidAddress) {
    throw new Error('涓嶅厑璁歌闂 Base URL锛氬煙鍚嶈В鏋愬埌绉佺綉鎴栨湰鏈哄湴鍧€')
  }
  const selected = addresses[0]
  const vettedAddresses = addresses.map((entry) => ({
    address: entry.address,
    family: entry.family as 4 | 6,
  }))
  return {
    url: normalized,
    address: selected.address,
    family: selected.family as 4 | 6,
    addresses: vettedAddresses,
  }
}

export async function assertAllowedProviderBaseUrlResolved(
  baseUrl: string,
  resolveHost?: ProviderResolver,
): Promise<string> {
  return (await resolveAllowedProviderTarget(baseUrl, resolveHost)).url
}
