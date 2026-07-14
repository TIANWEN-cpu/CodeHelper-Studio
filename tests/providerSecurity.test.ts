import { describe, it, expect } from 'vitest'
import {
  assertAllowedProviderBaseUrl,
  assertAllowedProviderBaseUrlResolved,
  resolveAllowedProviderTarget,
} from '../electron/utils/providerSecurity'

describe('assertAllowedProviderBaseUrl', () => {
  describe('允许的地址', () => {
    it('接受 HTTPS 公网域名并去除尾随斜杠', () => {
      expect(assertAllowedProviderBaseUrl('https://api.openai.com/v1/')).toBe(
        'https://api.openai.com/v1',
      )
    })

    it('接受 HTTPS 公网 IP', () => {
      expect(assertAllowedProviderBaseUrl('https://8.8.8.8')).toBe('https://8.8.8.8')
    })

    it('接受本机回环 http (localhost)', () => {
      expect(assertAllowedProviderBaseUrl('http://localhost:11434/v1')).toBe(
        'http://localhost:11434/v1',
      )
    })

    it('接受本机回环 http (127.0.0.1)', () => {
      expect(assertAllowedProviderBaseUrl('http://127.0.0.1:1234')).toBe('http://127.0.0.1:1234')
    })

    it('接受回环 127.0.0.0/8 内其它地址', () => {
      expect(assertAllowedProviderBaseUrl('http://127.0.0.2:8080')).toBe('http://127.0.0.2:8080')
    })

    it('接受 IPv6 回环 ::1', () => {
      expect(assertAllowedProviderBaseUrl('http://[::1]:11434')).toBe('http://[::1]:11434')
    })
  })

  describe('协议限制', () => {
    it('拒绝非回环的 http 地址', () => {
      expect(() => assertAllowedProviderBaseUrl('http://api.openai.com')).toThrow()
    })

    it('拒绝 ftp/file 等非 http(s) 协议', () => {
      expect(() => assertAllowedProviderBaseUrl('ftp://example.com')).toThrow()
      expect(() => assertAllowedProviderBaseUrl('file:///etc/passwd')).toThrow()
    })
  })

  describe('IPv4 私网 / 保留地址（SSRF 防护）', () => {
    it.each([
      'https://10.0.0.1',
      'https://198.18.0.1',
      'https://198.51.100.1',
      'https://203.0.113.1',
      'https://10.255.255.255',
      'https://172.16.0.1',
      'https://172.31.255.255',
      'https://192.168.1.1',
      'https://169.254.169.254', // 云元数据
      'https://169.254.1.1', // 链路本地
      'https://0.0.0.0',
      'https://100.64.0.1', // CGNAT
      'https://192.0.2.1', // 文档保留
      'https://224.0.0.1', // 多播
    ])('拒绝 %s', (url) => {
      expect(() => assertAllowedProviderBaseUrl(url)).toThrow(/私网或元数据/)
    })

    it('放行恰好在私网边界之外的地址', () => {
      expect(assertAllowedProviderBaseUrl('https://172.32.0.1')).toBe('https://172.32.0.1')
      expect(assertAllowedProviderBaseUrl('https://172.15.0.1')).toBe('https://172.15.0.1')
      expect(assertAllowedProviderBaseUrl('https://11.0.0.1')).toBe('https://11.0.0.1')
      expect(assertAllowedProviderBaseUrl('https://192.0.3.1')).toBe('https://192.0.3.1')
      expect(assertAllowedProviderBaseUrl('https://198.51.101.1')).toBe('https://198.51.101.1')
      expect(assertAllowedProviderBaseUrl('https://203.0.114.1')).toBe('https://203.0.114.1')
    })
  })

  describe('IP 编码绕过', () => {
    it('十进制整数私网 IP（3232235521 = 192.168.0.1）规范化后仍被拦截', () => {
      expect(() => assertAllowedProviderBaseUrl('https://3232235521')).toThrow(/私网或元数据/)
    })

    it('十六进制点分私网 IP（0xC0.0xA8.0.1 = 192.168.0.1）仍被拦截', () => {
      expect(() => assertAllowedProviderBaseUrl('https://0xC0.0xA8.0.1')).toThrow(/私网或元数据/)
    })

    it('十进制回环 IP（2130706433 = 127.0.0.1）规范化为回环并放行', () => {
      expect(assertAllowedProviderBaseUrl('https://2130706433')).toBe('https://127.0.0.1')
    })
  })

  describe('IPv6 私网绕过', () => {
    it.each([
      'https://[fc00::1]', // ULA
      'https://[fec0::1]',
      'https://[ff02::1]',
      'https://[100::1]',
      'https://[64:ff9b:1::1]',
      'https://[2001:db8::1]',
      'https://[2001:10::1]',
      'https://[2001:0:0:1:2:3:4:5]',
      'https://[2002:a9fe:a9fe::1]',
      'https://[3ffe::1]',
      'https://[3fff::1]',
      'https://[4000::1]',
      'https://[fd12:3456:789a::1]', // ULA
      'https://[fe80::1]', // 链路本地
      'https://[::]', // 未指定
      'https://[::ffff:192.168.0.1]', // IPv4-mapped 私网
      'https://[::ffff:169.254.169.254]', // IPv4-mapped 元数据
    ])('拒绝 %s', (url) => {
      expect(() => assertAllowedProviderBaseUrl(url)).toThrow()
    })

    it('IPv4-mapped 回环（::ffff:127.0.0.1）视为本机回环并放行', () => {
      expect(assertAllowedProviderBaseUrl('https://[::ffff:127.0.0.1]')).toBe(
        'https://[::ffff:7f00:1]',
      )
    })

    it('放行公网 IPv6', () => {
      expect(assertAllowedProviderBaseUrl('https://[2606:4700::1]')).toBe('https://[2606:4700::1]')
    })
  })

  describe('其它绕过手法', () => {
    it('拒绝 .local mDNS 主机名', () => {
      expect(() => assertAllowedProviderBaseUrl('https://myhost.local')).toThrow(/私网或元数据/)
    })

    it('拒绝带尾随点的私网地址（DNS 绝对名绕过）', () => {
      expect(() => assertAllowedProviderBaseUrl('https://10.0.0.1.')).toThrow(/私网或元数据/)
    })

    it('拒绝大小写混淆的元数据地址', () => {
      expect(() => assertAllowedProviderBaseUrl('https://LOCALHOST.LOCAL')).toThrow()
    })

    it('拒绝无法解析的 URL', () => {
      expect(() => assertAllowedProviderBaseUrl('not a url')).toThrow('参数无效: base_url')
      expect(() => assertAllowedProviderBaseUrl('')).toThrow('参数无效: base_url')
    })
  })

  // Node 的 URL 解析器会把各种 IP 编码技巧（十进制/八进制/十六进制/简写/IPv4-mapped）
  // 预先规范化成点分十进制或 ::ffff:hex 形式，validator 因此总能在标准形式上拦截。
  // 这些测试钉死"规范化保证"——一旦 Node 未来改变 URL 规范化行为，这里会先红。
  describe('IP 编码规范化（防 SSRF 绕过的关键保证）', () => {
    it('十进制整数 IP 被规范化为 127.0.0.1 → 仅允许 http 回环', () => {
      // http://2130706433 经 URL 解析 hostname=127.0.0.1 → 回环 → http 允许
      expect(assertAllowedProviderBaseUrl('http://2130706433')).toBe('http://127.0.0.1')
    })

    it('八进制 IP 被规范化为 127.0.0.1', () => {
      expect(assertAllowedProviderBaseUrl('http://0177.0.0.1')).toBe('http://127.0.0.1')
    })

    it('十六进制 IP 被规范化为 127.0.0.1', () => {
      expect(assertAllowedProviderBaseUrl('http://0x7f.0.0.1')).toBe('http://127.0.0.1')
    })

    it('简写 IP（127.1）被规范化为 127.0.0.1', () => {
      expect(assertAllowedProviderBaseUrl('http://127.1')).toBe('http://127.0.0.1')
    })

    it('IPv4-mapped IPv6 经规范化后仍按回环处理（http 允许）', () => {
      // [::ffff:127.0.0.1] → hostname [::ffff:7f00:1] → classifyIPv6 命中 mappedHex → loopback
      expect(assertAllowedProviderBaseUrl('http://[::ffff:127.0.0.1]')).toBe(
        'http://[::ffff:7f00:1]',
      )
    })

    it('IPv4-mapped 私网地址经规范化后被拒绝', () => {
      // ::ffff:10.0.0.1 → mappedHex 解析为 10.0.0.1 → blocked
      expect(() => assertAllowedProviderBaseUrl('https://[::ffff:10.0.0.1]')).toThrow(
        /私网或元数据/,
      )
    })

    it('IPv4-mapped 元数据地址经规范化后被拒绝', () => {
      // ::ffff:169.254.169.254 → blocked（云元数据端点）
      expect(() => assertAllowedProviderBaseUrl('https://[::ffff:169.254.169.254]')).toThrow(
        /私网或元数据/,
      )
    })
  })
})

describe('base URL structural restrictions', () => {
  it('rejects embedded credentials, query parameters, and fragments', () => {
    expect(() => assertAllowedProviderBaseUrl('https://user:pass@example.com/v1')).toThrow()
    expect(() => assertAllowedProviderBaseUrl('https://example.com/v1?target=internal')).toThrow()
    expect(() => assertAllowedProviderBaseUrl('https://example.com/v1#models')).toThrow()
  })
})

describe('assertAllowedProviderBaseUrlResolved', () => {
  it('times out a resolver that never settles', async () => {
    await expect(
      resolveAllowedProviderTarget(
        'https://provider.example/v1',
        async () => new Promise<never>(() => undefined),
        5,
      ),
    ).rejects.toThrow()
  })

  it('rejects a public hostname that resolves to a private address', async () => {
    await expect(
      assertAllowedProviderBaseUrlResolved('https://provider.example/v1', async () => [
        { address: '169.254.169.254', family: 4 },
      ]),
    ).rejects.toThrow()
  })

  it('accepts a hostname when every resolved address is public', async () => {
    await expect(
      assertAllowedProviderBaseUrlResolved('https://provider.example/v1', async () => [
        { address: '93.184.216.34', family: 4 },
      ]),
    ).resolves.toBe('https://provider.example/v1')
  })

  it('returns the exact public address that must be used for the connection', async () => {
    await expect(
      resolveAllowedProviderTarget('https://provider.example/v1', async () => [
        { address: '93.184.216.34', family: 4 },
      ]),
    ).resolves.toEqual({
      url: 'https://provider.example/v1',
      address: '93.184.216.34',
      family: 4,
      addresses: [{ address: '93.184.216.34', family: 4 }],
    })
  })
})
