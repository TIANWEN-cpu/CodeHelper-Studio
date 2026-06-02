import { describe, bench } from 'vitest'
import { splitIntoChunks, escapeRegExp } from '../../electron/utils/textUtils'

/** 生成指定大小的模拟文档文本 */
function generateDocument(paragraphs: number, paragraphLen: number): string {
  const para = 'A'.repeat(paragraphLen)
  return Array.from({ length: paragraphs }, () => para).join('\n\n')
}

/** 生成含多种特殊字符的文本用于正则转义 */
function generateSpecialText(): string {
  return 'func(a+b) * c? price is $100 [range] {set} |pipe| dot.end ^caret$ slash\\back'
}

describe('splitIntoChunks', () => {
  bench('短文本 (< 500 字符)', () => {
    splitIntoChunks(generateDocument(3, 100), 500)
  })

  bench('中等文本 (~5KB)', () => {
    splitIntoChunks(generateDocument(20, 200), 500)
  })

  bench('大文本 (~50KB)', () => {
    splitIntoChunks(generateDocument(200, 200), 1000)
  })

  bench('超大文本 (~500KB)', () => {
    splitIntoChunks(generateDocument(2000, 200), 2000)
  })

  bench('极小 maxLen（逐段拆分）', () => {
    splitIntoChunks(generateDocument(50, 100), 110)
  })

  bench('极大 maxLen（不拆分）', () => {
    splitIntoChunks(generateDocument(50, 100), 1_000_000)
  })
})

describe('escapeRegExp', () => {
  bench('无特殊字符', () => {
    escapeRegExp('hello world this is a normal string without specials')
  })

  bench('全部特殊字符', () => {
    escapeRegExp('.*+?^${}()|[]\\')
  })

  bench('混合文本（中等特殊字符密度）', () => {
    escapeRegExp(generateSpecialText())
  })

  bench('长字符串含少量特殊字符', () => {
    escapeRegExp('a'.repeat(1000) + '.*' + 'b'.repeat(1000))
  })
})
