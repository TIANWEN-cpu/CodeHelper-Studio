import { describe, expect, it } from 'vitest'
import {
  buildLocalEvaluationChannels,
  expandKnowledgeQuery,
  fuseKnowledgeCandidates,
  localSemanticSimilarity,
  type KnowledgeRetrievalCandidate,
} from '../electron/utils/knowledgeRetrieval'

const candidates: KnowledgeRetrievalCandidate[] = [
  {
    id: 1,
    doc_id: 1,
    filename: 'binary-search.md',
    content: 'Binary search halves a sorted array. 二分查找要求数组有序。',
    chunk_index: 0,
  },
  {
    id: 2,
    doc_id: 2,
    filename: 'graph.md',
    content: 'Breadth first search uses a queue.',
    chunk_index: 0,
  },
]

describe('knowledge retrieval ranking', () => {
  it('expands bilingual computer-science terminology deterministically', () => {
    const terms = expandKnowledgeQuery('如何做二分搜索')
    expect(terms).toContain('binary search')
    expect(terms).toContain('二分查找')
    expect(terms).toContain('二分搜索')
  })

  it('gives related bilingual content a higher local semantic score', () => {
    const related = localSemanticSimilarity('二分搜索', candidates[0].content)
    const unrelated = localSemanticSimilarity('二分搜索', candidates[1].content)
    expect(related).toBeGreaterThan(unrelated)
  })

  it('fuses keyword and semantic channels with auditable explanations', () => {
    const results = fuseKnowledgeCandidates('binary search', {
      keyword: [candidates[0]],
      semantic: [candidates[0], candidates[1]],
      fallback: [],
    })
    expect(results[0]).toMatchObject({
      filename: 'binary-search.md',
      channels: expect.arrayContaining(['keyword', 'semantic']),
      explanation: expect.stringContaining('BM25'),
    })
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
  })

  it('limits repeated chunks from one document to preserve source diversity', () => {
    const repeated = Array.from({ length: 4 }, (_, index) => ({
      ...candidates[0],
      id: index + 10,
      chunk_index: index,
    }))
    const results = fuseKnowledgeCandidates(
      'binary search',
      { keyword: repeated, semantic: repeated, fallback: repeated },
      10,
    )
    expect(results).toHaveLength(2)
  })

  it('builds deterministic local evaluation channels', () => {
    const channels = buildLocalEvaluationChannels('BFS queue', candidates)
    expect(channels.keyword[0].filename).toBe('graph.md')
    expect(channels.semantic[0].filename).toBe('graph.md')
  })
})
