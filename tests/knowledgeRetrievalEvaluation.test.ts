import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildLocalEvaluationChannels,
  fuseKnowledgeCandidates,
  type KnowledgeRetrievalCandidate,
} from '../electron/utils/knowledgeRetrieval'

type EvalFixture = {
  chunks: KnowledgeRetrievalCandidate[]
  cases: Array<{ query: string; expected: string }>
}

function loadFixture(): EvalFixture {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'tests/fixtures/knowledge-retrieval-eval.json'), 'utf8'),
  ) as EvalFixture
}

describe('knowledge retrieval evaluation', () => {
  it('meets the checked-in Recall@3 and MRR quality gates', () => {
    const fixture = loadFixture()
    let recalledAt3 = 0
    let reciprocalRankTotal = 0

    for (const item of fixture.cases) {
      const results = fuseKnowledgeCandidates(
        item.query,
        buildLocalEvaluationChannels(item.query, fixture.chunks),
        5,
      )
      const rank = results.findIndex((result) => result.filename === item.expected) + 1
      if (rank > 0 && rank <= 3) recalledAt3++
      if (rank > 0) reciprocalRankTotal += 1 / rank
    }

    const recallAt3 = recalledAt3 / fixture.cases.length
    const mrr = reciprocalRankTotal / fixture.cases.length
    expect(recallAt3).toBeGreaterThanOrEqual(0.95)
    expect(mrr).toBeGreaterThanOrEqual(0.85)
  })
})
