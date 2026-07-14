import { describe, it, expect } from 'vitest'
import { getPetReaction, pickIdleAnimation, IDLE_ANIMATIONS } from '../src/lib/petReactions'

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

describe('pickIdleAnimation', () => {
  it('maps the seed range across all idle animations', () => {
    expect(pickIdleAnimation(0).state).toBe('waving')
    expect(pickIdleAnimation(0.5).state).toBe('jumping')
  })

  it('always returns a valid idle animation for boundary/invalid seeds', () => {
    for (const seed of [0, 0.999999, 1, -1, NaN, Infinity]) {
      const move = pickIdleAnimation(seed)
      expect(IDLE_ANIMATIONS).toContainEqual(move)
      expect(move.duration).toBeGreaterThan(0)
    }
  })

  it('idle animations carry no message (silent)', () => {
    expect(IDLE_ANIMATIONS.every((a) => a.message === undefined)).toBe(true)
  })
})
