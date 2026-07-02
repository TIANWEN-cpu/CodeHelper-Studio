// rag.ts 顶层 import electron + db（IPC 注册）。只测导出的纯解析函数，mock 掉副作用。
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, dialog: { showOpenDialog: vi.fn() } }))
vi.mock('../electron/db/index', () => ({ getDB: vi.fn(), initKnowledgeDB: vi.fn() }))

import { describe, it, expect } from 'vitest'
import {
  extractYamlScalar,
  extractYamlTags,
  titleFromFilename,
  topConceptsFromChunks,
  type ScoredKnowledgeChunk,
} from '../electron/ipc/rag'

function chunk(content: string, score = 1): ScoredKnowledgeChunk {
  return { content, score } as ScoredKnowledgeChunk
}

describe('extractYamlScalar', () => {
  it('提取无引号的标量值', () => {
    expect(extractYamlScalar('title: 我的笔记\n', 'title')).toBe('我的笔记')
  })

  it('提取带双引号的标量值（去引号）', () => {
    expect(extractYamlScalar('title: "带空格 的标题"', 'title')).toBe('带空格 的标题')
  })

  it('多行 frontmatter 中定位目标 key', () => {
    const fm = '---\ntitle: A\nauthor: B\ndate: 2026\n---'
    expect(extractYamlScalar(fm, 'author')).toBe('B')
  })

  it('key 不存在时返回 undefined', () => {
    expect(extractYamlScalar('title: A\n', 'missing')).toBeUndefined()
  })

  it('空 frontMatter 返回 undefined', () => {
    expect(extractYamlScalar('', 'title')).toBeUndefined()
  })
})

describe('extractYamlTags', () => {
  it('提取列表形式的 tags', () => {
    const fm = 'tags:\n  - python\n  - 算法\n'
    expect(extractYamlTags(fm)).toEqual(['python', '算法'])
  })

  it('支持带引号的 tag', () => {
    const fm = 'tags:\n  - "带空格的标签"\n  - plain\n'
    expect(extractYamlTags(fm)).toEqual(['带空格的标签', 'plain'])
  })

  it('无 tags 块时返回空数组', () => {
    expect(extractYamlTags('title: A\n')).toEqual([])
    expect(extractYamlTags('')).toEqual([])
  })

  it('忽略空行/格式不符的行', () => {
    const fm = 'tags:\n  - valid\n\n  -also-valid-after-bad-line\n'
    // 第二项 "  -also-valid-after-bad-line" 不匹配 "^\s+-\s*"（缺空格），被过滤
    const result = extractYamlTags(fm)
    expect(result).toContain('valid')
  })
})

describe('titleFromFilename', () => {
  it('去掉 .md 扩展名', () => {
    expect(titleFromFilename('我的笔记.md')).toBe('我的笔记')
  })

  it('以 __ 分隔时取最后一段', () => {
    expect(titleFromFilename('prefix__Real Title.md')).toBe('Real Title')
  })

  it('去除开头的 8 位十六进制 hash 前缀', () => {
    expect(titleFromFilename('a1b2c3d4_my-title.md')).toBe('my title')
  })

  it('连字符/下划线转为空格', () => {
    expect(titleFromFilename('some-cool_note.md')).toBe('some cool note')
  })

  it('无扩展名或无分隔符时仍正常工作', () => {
    expect(titleFromFilename('PlainTitle')).toBe('PlainTitle')
  })

  it('大写 .MD 扩展名也能去掉', () => {
    expect(titleFromFilename('Note.MD')).toBe('Note')
  })

  it('去除结果两端空白', () => {
    expect(titleFromFilename('  spaced  .md')).toBe('spaced')
  })
})

describe('topConceptsFromChunks', () => {
  it('按词频降序返回 top N 概念', () => {
    const result = topConceptsFromChunks([
      chunk('python python data'),
      chunk('data structure python'),
    ])
    // python 出现3次，data 2次，structure 1次
    expect(result[0]).toBe('python')
    expect(result[1]).toBe('data')
    expect(result).toContain('structure')
  })

  it('过滤英文停用词（the/and/for/with 等）', () => {
    const result = topConceptsFromChunks([
      chunk('the algorithm and the data with for this that from are was were'),
    ])
    expect(result).not.toContain('the')
    expect(result).not.toContain('and')
    expect(result).toContain('algorithm')
    expect(result).toContain('data')
  })

  it('支持中文词（按字符匹配 一-龥）', () => {
    const result = topConceptsFromChunks([chunk('算法 数据结构 算法')])
    expect(result).toContain('算法')
  })

  it('limit 限制返回数量', () => {
    const result = topConceptsFromChunks([chunk('aa bb cc dd ee ff gg hh')], 3)
    expect(result).toHaveLength(3)
  })

  it('空 chunks 返回空数组', () => {
    expect(topConceptsFromChunks([])).toEqual([])
  })

  it('忽略单字符词（只保留长度>=2）', () => {
    // "a" "x" 单字符被过滤；"ab" "xy" 保留
    const result = topConceptsFromChunks([chunk('a x ab xy')])
    expect(result).not.toContain('a')
    expect(result).toContain('ab')
    expect(result).toContain('xy')
  })

  it('大小写不敏感（统一小写统计）', () => {
    const result = topConceptsFromChunks([chunk('Python PYTHON python')])
    // 三种写法合并计数
    expect(result[0]).toBe('python')
  })
})
