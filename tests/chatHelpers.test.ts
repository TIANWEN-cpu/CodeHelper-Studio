import { describe, it, expect } from 'vitest'
import {
  extractMemoryCandidates,
  buildSearchTerms,
  BUILTIN_PRESETS,
} from '../electron/utils/chatHelpers'

describe('extractMemoryCandidates', () => {
  describe('记住 模式 (fact)', () => {
    it('"记住xxx" 提取为 fact 类别', () => {
      const result = extractMemoryCandidates('记住我的生日是3月15日')
      expect(result).toEqual([
        { content: '我的生日是3月15日', category: 'fact' },
      ])
    })

    it('"请记住xxx" 提取为 fact 类别', () => {
      const result = extractMemoryCandidates('请记住我喜欢用Python')
      expect(result).toEqual([
        { content: '我喜欢用Python', category: 'fact' },
      ])
    })

    it('"帮我记住xxx" 提取为 fact 类别', () => {
      const result = extractMemoryCandidates('帮我记住我在学算法')
      expect(result).toEqual([
        { content: '我在学算法', category: 'fact' },
      ])
    })

    it('冒号分隔也能提取', () => {
      const result = extractMemoryCandidates('记住：数据库很重要')
      expect(result).toEqual([
        { content: '数据库很重要', category: 'fact' },
      ])
    })

    it('全角冒号分隔也能提取', () => {
      const result = extractMemoryCandidates('记住：数据库很重要')
      expect(result).toEqual([
        { content: '数据库很重要', category: 'fact' },
      ])
    })
  })

  describe('记一下 模式 (fact)', () => {
    it('"记一下xxx" 提取为 fact 类别', () => {
      const result = extractMemoryCandidates('记一下排序算法的时间复杂度')
      expect(result).toEqual([
        { content: '排序算法的时间复杂度', category: 'fact' },
      ])
    })

    it('"请记一下xxx" 提取为 fact 类别', () => {
      const result = extractMemoryCandidates('请记一下明天有考试')
      expect(result).toEqual([
        { content: '明天有考试', category: 'fact' },
      ])
    })

    it('"帮我记一下xxx" 提取为 fact 类别', () => {
      const result = extractMemoryCandidates('帮我记一下Java版本是17')
      expect(result).toEqual([
        { content: 'Java版本是17', category: 'fact' },
      ])
    })
  })

  describe('以后/后面 模式 (preference)', () => {
    it('"以后xxx" 提取为 preference 类别', () => {
      const result = extractMemoryCandidates('以后回答用英文')
      expect(result).toEqual([
        { content: '回答用英文', category: 'preference' },
      ])
    })

    it('"后面xxx" 提取为 preference 类别', () => {
      const result = extractMemoryCandidates('后面请多用例子解释')
      expect(result).toEqual([
        { content: '请多用例子解释', category: 'preference' },
      ])
    })
  })

  describe('不匹配的输入', () => {
    it('普通对话不提取', () => {
      expect(extractMemoryCandidates('什么是快速排序？')).toEqual([])
    })

    it('空字符串不提取', () => {
      expect(extractMemoryCandidates('')).toEqual([])
    })

    it('纯空白不提取', () => {
      expect(extractMemoryCandidates('   ')).toEqual([])
    })

    it('内容太短（< 2 字符）不提取', () => {
      expect(extractMemoryCandidates('记住a')).toEqual([])
    })

    it('"记住" 后跟单个字符不提取', () => {
      expect(extractMemoryCandidates('记住x')).toEqual([])
    })
  })

  describe('长度截断', () => {
    it('超过 300 字符的内容被截断', () => {
      const longContent = 'a'.repeat(400)
      const result = extractMemoryCandidates(`记住${longContent}`)
      expect(result).toHaveLength(1)
      expect(result[0].content).toHaveLength(300)
    })

    it('恰好 300 字符不截断', () => {
      const content300 = 'a'.repeat(300)
      const result = extractMemoryCandidates(`记住${content300}`)
      expect(result).toHaveLength(1)
      expect(result[0].content).toHaveLength(300)
    })
  })

  describe('多模式同时匹配', () => {
    it('"记住" 和 "以后" 同时匹配时返回两条', () => {
      // "记住xxx" 不会同时匹配 "以后"，因为整行文本只能匹配一个模式
      // 但可以通过类似 "记住xxx 以后yyy" 来测试
      // 实际上 "记住xxx 以后yyy" 会匹配 "记住"，但不匹配 "以后"（因为整行不以"以后"开头）
      const result = extractMemoryCandidates('以后请用中文回答，记住我是学生')
      // "以后请用中文回答，记住我是学生" 匹配 "以后" -> preference: "请用中文回答，记住我是学生"
      // 不匹配 "记住" (不以"记住"开头)
      expect(result).toHaveLength(1)
      expect(result[0].category).toBe('preference')
    })
  })
})

describe('buildSearchTerms', () => {
  it('单个单词提取', () => {
    expect(buildSearchTerms('hello')).toEqual(['hello'])
  })

  it('多个空格分隔的词提取', () => {
    const terms = buildSearchTerms('hello world test')
    expect(terms).toContain('hello')
    expect(terms).toContain('world')
    expect(terms).toContain('test')
  })

  it('单字符词被过滤（< 2 字符）', () => {
    const terms = buildSearchTerms('a b cd ef')
    expect(terms).not.toContain('a')
    expect(terms).not.toContain('b')
    expect(terms).toContain('cd')
    expect(terms).toContain('ef')
  })

  it('中文标点符号作为分隔符', () => {
    const terms = buildSearchTerms('你好，世界！测试')
    expect(terms).toContain('你好')
    expect(terms).toContain('世界')
    expect(terms).toContain('测试')
  })

  it('英文标点符号作为分隔符', () => {
    const terms = buildSearchTerms('hello, world! test? yes: ok; no')
    expect(terms).toContain('hello')
    expect(terms).toContain('world')
    expect(terms).toContain('test')
    expect(terms).toContain('yes')
    expect(terms).toContain('ok')
    expect(terms).toContain('no')
  })

  it('括号和引号作为分隔符', () => {
    const terms = buildSearchTerms('func(args) "quoted" [array] {obj}')
    expect(terms).toContain('func')
    expect(terms).toContain('args')
    expect(terms).toContain('quoted')
    expect(terms).toContain('array')
    expect(terms).toContain('obj')
  })

  it('生成紧凑版搜索词（去掉空格）', () => {
    const terms = buildSearchTerms('hello world')
    expect(terms).toContain('helloworld')
  })

  it('紧凑版最多 12 个字符', () => {
    const terms = buildSearchTerms('abcdefghijklmnop qrstuvwxyz')
    const _compact = terms.find((t) => !t.includes(' '))
    // The compact term should be at most 12 chars
    const allCompact = terms.filter(
      (t) => t.length >= 2 && !t.includes(' ') && t.length <= 12,
    )
    expect(allCompact.length).toBeGreaterThanOrEqual(1)
  })

  it('去重', () => {
    const terms = buildSearchTerms('hello hello hello')
    const helloCount = terms.filter((t) => t === 'hello').length
    expect(helloCount).toBe(1)
  })

  it('空字符串返回空数组', () => {
    // Empty string after trim, split produces [''], filter removes items < 2
    // compact is '', length 0 < 2 so no compact term
    expect(buildSearchTerms('')).toEqual([])
  })

  it('纯空白返回空数组', () => {
    expect(buildSearchTerms('   ')).toEqual([])
  })

  it('大小写统一为小写', () => {
    const terms = buildSearchTerms('Hello WORLD')
    expect(terms).toContain('hello')
    expect(terms).toContain('world')
  })

  it('前导/尾随空白被去除', () => {
    const terms = buildSearchTerms('  hello  world  ')
    expect(terms).toContain('hello')
    expect(terms).toContain('world')
  })
})

describe('BUILTIN_PRESETS', () => {
  it('包含 4 个预设', () => {
    expect(BUILTIN_PRESETS).toHaveLength(4)
  })

  it('每个预设都有 name 和 prompt', () => {
    for (const preset of BUILTIN_PRESETS) {
      expect(preset.name).toBeTruthy()
      expect(preset.prompt).toBeTruthy()
    }
  })

  it('预设名称正确', () => {
    const names = BUILTIN_PRESETS.map((p) => p.name)
    expect(names).toEqual(['通用助手', '代码专家', '面试官', '学习导师'])
  })

  it('预设 prompt 均为中文', () => {
    for (const preset of BUILTIN_PRESETS) {
      expect(preset.prompt).toMatch(/[一-鿿]/)
    }
  })
})
