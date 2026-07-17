import type {
  KnowledgeRetrievalChannel,
  KnowledgeSearchResult,
} from '../../src/shared/knowledgeRetrievalContract'

export interface KnowledgeRetrievalCandidate {
  id: number
  doc_id: number
  filename: string
  content: string
  chunk_index: number
}

export interface KnowledgeRetrievalChannels {
  keyword: KnowledgeRetrievalCandidate[]
  semantic: KnowledgeRetrievalCandidate[]
  fallback: KnowledgeRetrievalCandidate[]
}

const RRF_K = 60
const MAX_QUERY_TERMS = 24

const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['binary search', '二分查找', '二分搜索'],
  ['dynamic programming', 'dp', '动态规划', '重叠子问题'],
  ['breadth first search', 'bfs', '广度优先搜索', '广度优先遍历'],
  ['depth first search', 'dfs', '深度优先搜索', '深度优先遍历'],
  ['memory leak', '内存泄漏', 'malloc free'],
  ['hash table', 'hash map', '哈希表', '散列表'],
  ['linked list', '链表'],
  ['stack', '栈'],
  ['queue', '队列'],
  ['time complexity', '时间复杂度', 'big o'],
  ['space complexity', '空间复杂度'],
  ['shortest path', '最短路径', 'dijkstra'],
  ['greedy', '贪心'],
  ['backtracking', '回溯'],
  ['recursion', '递归'],
  ['deadlock', '死锁'],
  ['garbage collection', 'gc', '垃圾回收'],
  ['async await', '异步等待', '异步编程'],
  ['database transaction', '数据库事务', 'transaction'],
  ['join', '表连接', '联表'],
] as const

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function normalizeKnowledgeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9+#\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cjkSequences(value: string): string[] {
  return value.match(/[\u3400-\u9fff]{2,}/g) ?? []
}

function asciiTerms(value: string): string[] {
  return value.match(/[a-z0-9][a-z0-9+#]{1,}/g) ?? []
}

export function expandKnowledgeQuery(query: string): string[] {
  const normalized = normalizeKnowledgeText(query)
  if (!normalized) return []

  const terms = new Set<string>([normalized])
  for (const term of asciiTerms(normalized)) terms.add(term)
  for (const sequence of cjkSequences(normalized)) {
    terms.add(sequence)
    if (sequence.length > 2) {
      for (let index = 0; index < sequence.length - 1; index++) {
        terms.add(sequence.slice(index, index + 2))
      }
    }
  }

  for (const group of SYNONYM_GROUPS) {
    if (group.some((alias) => normalized.includes(normalizeKnowledgeText(alias)))) {
      for (const alias of group) terms.add(normalizeKnowledgeText(alias))
    }
  }

  return [...terms]
    .filter((term) => term.length > 1 || term === 'c')
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, MAX_QUERY_TERMS)
}

function addFeature(features: Map<string, number>, key: string, weight: number): void {
  features.set(key, (features.get(key) ?? 0) + weight)
}

function featureVector(value: string): Map<string, number> {
  const normalized = normalizeKnowledgeText(value)
  const features = new Map<string, number>()
  for (const term of asciiTerms(normalized)) addFeature(features, `w:${term}`, 2)
  for (const sequence of cjkSequences(normalized)) {
    addFeature(features, `c:${sequence}`, 2)
    for (let index = 0; index < sequence.length - 1; index++) {
      addFeature(features, `b:${sequence.slice(index, index + 2)}`, 1.5)
    }
  }

  const compact = normalized.replace(/\s+/g, '')
  for (let index = 0; index < compact.length - 2; index++) {
    addFeature(features, `g:${compact.slice(index, index + 3)}`, 0.6)
  }
  return features
}

export function localSemanticSimilarity(query: string, candidate: string): number {
  const left = featureVector(expandKnowledgeQuery(query).join(' '))
  const right = featureVector(candidate)
  if (left.size === 0 || right.size === 0) return 0

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (const value of left.values()) leftNorm += value * value
  for (const value of right.values()) rightNorm += value * value
  for (const [feature, value] of left) dot += value * (right.get(feature) ?? 0)
  if (leftNorm === 0 || rightNorm === 0) return 0
  return clamp01(dot / Math.sqrt(leftNorm * rightNorm))
}

export function keywordRelevance(query: string, candidate: KnowledgeRetrievalCandidate): number {
  const normalizedContent = normalizeKnowledgeText(candidate.content)
  const normalizedFilename = normalizeKnowledgeText(candidate.filename)
  const terms = expandKnowledgeQuery(query)
  if (terms.length === 0) return 0

  let matched = 0
  let weightedFrequency = 0
  for (const term of terms) {
    const contentMatches = normalizedContent.split(term).length - 1
    const filenameMatches = normalizedFilename.includes(term) ? 1 : 0
    if (contentMatches > 0 || filenameMatches > 0) matched++
    weightedFrequency += Math.min(4, contentMatches) + filenameMatches * 2
  }

  const coverage = matched / terms.length
  const frequency = Math.min(1, weightedFrequency / Math.max(4, terms.length * 2))
  const exact = normalizedContent.includes(normalizeKnowledgeText(query)) ? 1 : 0
  return clamp01(coverage * 0.5 + frequency * 0.3 + exact * 0.2)
}

function channelExplanation(channels: KnowledgeRetrievalChannel[]): string {
  if (channels.includes('keyword') && channels.includes('semantic')) {
    return 'BM25 关键词召回与本地语义近似共同命中。'
  }
  if (channels.includes('semantic')) return '本地字符 n-gram 与术语扩展命中。'
  if (channels.includes('keyword')) return 'BM25 关键词索引命中。'
  return 'FTS 不可用或未命中，使用有界关键词扫描降级召回。'
}

export function fuseKnowledgeCandidates(
  query: string,
  channelCandidates: KnowledgeRetrievalChannels,
  limit = 10,
): KnowledgeSearchResult[] {
  const merged = new Map<
    number,
    {
      candidate: KnowledgeRetrievalCandidate
      channels: Set<KnowledgeRetrievalChannel>
      rrf: number
    }
  >()

  const addChannel = (
    channel: KnowledgeRetrievalChannel,
    candidates: KnowledgeRetrievalCandidate[],
    weight: number,
  ) => {
    candidates.forEach((candidate, index) => {
      const current = merged.get(candidate.id) ?? {
        candidate,
        channels: new Set<KnowledgeRetrievalChannel>(),
        rrf: 0,
      }
      current.channels.add(channel)
      current.rrf += weight / (RRF_K + index + 1)
      merged.set(candidate.id, current)
    })
  }

  addChannel('keyword', channelCandidates.keyword, 1)
  addChannel('semantic', channelCandidates.semantic, 0.9)
  addChannel('fallback', channelCandidates.fallback, 0.45)

  const ranked = [...merged.values()].map(({ candidate, channels, rrf }) => {
    const keywordScore = keywordRelevance(query, candidate)
    const semanticScore = localSemanticSimilarity(
      query,
      `${candidate.filename}\n${candidate.content}`,
    )
    return {
      candidate,
      channels: [...channels],
      keywordScore,
      semanticScore,
      rawScore: rrf + keywordScore * 0.035 + semanticScore * 0.03,
    }
  })

  ranked.sort(
    (a, b) =>
      b.rawScore - a.rawScore ||
      b.keywordScore - a.keywordScore ||
      b.semanticScore - a.semanticScore ||
      a.candidate.id - b.candidate.id,
  )

  const maxScore = ranked[0]?.rawScore ?? 1
  const perDocument = new Map<number, number>()
  const results: KnowledgeSearchResult[] = []
  for (const item of ranked) {
    const count = perDocument.get(item.candidate.doc_id) ?? 0
    if (count >= 2) continue
    perDocument.set(item.candidate.doc_id, count + 1)
    const normalizedScore = maxScore > 0 ? item.rawScore / maxScore : 0
    results.push({
      ...item.candidate,
      score: clamp01(normalizedScore),
      keywordScore: clamp01(item.keywordScore),
      semanticScore: clamp01(item.semanticScore),
      channels: item.channels,
      explanation: channelExplanation(item.channels),
    })
    if (results.length >= limit) break
  }
  return results
}

export function buildLocalEvaluationChannels(
  query: string,
  candidates: KnowledgeRetrievalCandidate[],
): KnowledgeRetrievalChannels {
  const keyword = candidates
    .slice()
    .sort((a, b) => keywordRelevance(query, b) - keywordRelevance(query, a))
    .filter((candidate) => keywordRelevance(query, candidate) > 0)
  const semantic = candidates
    .slice()
    .sort(
      (a, b) =>
        localSemanticSimilarity(query, `${b.filename}\n${b.content}`) -
        localSemanticSimilarity(query, `${a.filename}\n${a.content}`),
    )
    .filter(
      (candidate) =>
        localSemanticSimilarity(query, `${candidate.filename}\n${candidate.content}`) > 0,
    )
  return { keyword, semantic, fallback: keyword }
}
