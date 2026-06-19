import { describe, it, expect } from 'vitest'
import { getPetReaction } from '../src/lib/petReactions'

describe('getPetReaction', () => {
  it('celebrates a solved problem with a jump and a message', () => {
    const reaction = getPetReaction('problem_solved')
    expect(reaction).not.toBeNull()
    expect(reaction?.state).toBe('jumping')
    expect(reaction?.message).toBeTruthy()
    expect(reaction?.duration).toBeGreaterThan(0)
  })

  it('celebrates a completed lesson', () => {
    const reaction = getPetReaction('lesson_completed')
    expect(reaction?.state).toBe('jumping')
    expect(reaction?.message).toBeTruthy()
  })

  it('stays quiet for high-frequency events', () => {
    expect(getPetReaction('code_run')).toBeNull()
    expect(getPetReaction('ai_chat_sent')).toBeNull()
  })

  it('returns null for unknown activity types', () => {
    expect(getPetReaction('something_else')).toBeNull()
  })
})
