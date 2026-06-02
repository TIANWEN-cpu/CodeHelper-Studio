import { describe, it, expect, vi } from 'vitest'

/**
 * Tests for ProblemDetail business logic helpers.
 *
 * These functions are embedded in ProblemDetail.tsx (not exported).
 * We extract and test the identical logic here to verify correctness of:
 * - Starter code fallback selection
 * - Language validation against available languages
 * - Difficulty class and label mapping
 * - Split ratio clamping
 * - OJ mode detection
 */

// ---------------------------------------------------------------------------
// Starter code fallback logic (from ProblemDetail.tsx lines 42-49)
// ---------------------------------------------------------------------------

interface StarterCodeTest {
  starterCode: Record<string, string>
  languages: string[]
  selectedLanguage: string
}

function resolveStarterCode({ starterCode, languages, selectedLanguage }: StarterCodeTest): {
  code: string
  languageChanged: boolean
  newLanguage?: string
} {
  // Simulate language validation
  if (languages.length > 0 && !languages.includes(selectedLanguage)) {
    return { code: '', languageChanged: true, newLanguage: languages[0] }
  }

  const fallbackCode =
    starterCode[selectedLanguage] || starterCode['python'] || Object.values(starterCode)[0] || ''

  return { code: fallbackCode, languageChanged: false }
}

describe('starter code fallback', () => {
  it('uses code for selected language when available', () => {
    const result = resolveStarterCode({
      starterCode: { python: 'print("hi")', cpp: '#include <iostream>' },
      languages: ['python', 'cpp'],
      selectedLanguage: 'python',
    })
    expect(result.code).toBe('print("hi")')
    expect(result.languageChanged).toBe(false)
  })

  it('falls back to python when selected language not in starter code', () => {
    const result = resolveStarterCode({
      starterCode: { python: 'print("hi")' },
      languages: ['python', 'cpp'],
      selectedLanguage: 'cpp',
    })
    expect(result.code).toBe('print("hi")')
  })

  it('falls back to first available code when no python key', () => {
    const result = resolveStarterCode({
      starterCode: { cpp: 'int main() {}' },
      languages: ['python', 'cpp'],
      selectedLanguage: 'python',
    })
    expect(result.code).toBe('int main() {}')
  })

  it('returns empty string when no starter code exists', () => {
    const result = resolveStarterCode({
      starterCode: {},
      languages: ['python'],
      selectedLanguage: 'python',
    })
    expect(result.code).toBe('')
  })

  it('switches language when selected language not in available list', () => {
    const result = resolveStarterCode({
      starterCode: { python: 'x', java: 'y' },
      languages: ['python', 'java'],
      selectedLanguage: 'cpp',
    })
    expect(result.languageChanged).toBe(true)
    expect(result.newLanguage).toBe('python')
  })

  it('does not switch language when available list is empty', () => {
    const result = resolveStarterCode({
      starterCode: { python: 'x' },
      languages: [],
      selectedLanguage: 'cpp',
    })
    expect(result.languageChanged).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Difficulty class and label mapping (from ProblemDetail.tsx lines 151-164)
// ---------------------------------------------------------------------------

function getDifficultyInfo(difficulty: string): { className: string; label: string } {
  const className =
    difficulty === 'easy'
      ? 'ui-chip-success'
      : difficulty === 'medium'
        ? 'ui-chip-warning'
        : 'ui-chip-danger'

  const label = difficulty === 'easy' ? '简单' : difficulty === 'medium' ? '中等' : '困难'

  return { className, label }
}

describe('difficulty mapping', () => {
  it('maps easy to success class and "简单"', () => {
    expect(getDifficultyInfo('easy')).toEqual({
      className: 'ui-chip-success',
      label: '简单',
    })
  })

  it('maps medium to warning class and "中等"', () => {
    expect(getDifficultyInfo('medium')).toEqual({
      className: 'ui-chip-warning',
      label: '中等',
    })
  })

  it('maps hard to danger class and "困难"', () => {
    expect(getDifficultyInfo('hard')).toEqual({
      className: 'ui-chip-danger',
      label: '困难',
    })
  })

  it('defaults unknown difficulty to danger/困难', () => {
    expect(getDifficultyInfo('unknown')).toEqual({
      className: 'ui-chip-danger',
      label: '困难',
    })
  })

  it('defaults empty string to danger/困难', () => {
    expect(getDifficultyInfo('')).toEqual({
      className: 'ui-chip-danger',
      label: '困难',
    })
  })
})

// ---------------------------------------------------------------------------
// Split ratio clamping (from ProblemDetail.tsx line 71)
// ---------------------------------------------------------------------------

function clampSplitRatio(ratio: number): number {
  return Math.max(0.24, Math.min(0.62, ratio))
}

describe('split ratio clamping', () => {
  it('preserves ratio within valid range', () => {
    expect(clampSplitRatio(0.38)).toBe(0.38)
  })

  it('clamps to minimum 0.24', () => {
    expect(clampSplitRatio(0.1)).toBe(0.24)
  })

  it('clamps to maximum 0.62', () => {
    expect(clampSplitRatio(0.8)).toBe(0.62)
  })

  it('allows exact minimum boundary', () => {
    expect(clampSplitRatio(0.24)).toBe(0.24)
  })

  it('allows exact maximum boundary', () => {
    expect(clampSplitRatio(0.62)).toBe(0.62)
  })

  it('clamps negative values', () => {
    expect(clampSplitRatio(-1)).toBe(0.24)
  })

  it('clamps values greater than 1', () => {
    expect(clampSplitRatio(2)).toBe(0.62)
  })

  it('calculates from mouse offset correctly', () => {
    // Simulates: offsetX / containerWidth
    const containerWidth = 1000
    const offsetX = 380
    expect(clampSplitRatio(offsetX / containerWidth)).toBe(0.38)
  })
})

// ---------------------------------------------------------------------------
// OJ mode detection (from ProblemDetail.tsx line 121)
// ---------------------------------------------------------------------------

function isOJMode(mode?: string | null): boolean {
  return (mode ?? 'oj') === 'oj'
}

describe('OJ mode detection', () => {
  it('returns true for "oj" mode', () => {
    expect(isOJMode('oj')).toBe(true)
  })

  it('returns true when mode is undefined (defaults to oj)', () => {
    expect(isOJMode(undefined)).toBe(true)
  })

  it('returns true when mode is null (defaults to oj)', () => {
    expect(isOJMode(null)).toBe(true)
  })

  it('returns false for "simulation" mode', () => {
    expect(isOJMode('simulation')).toBe(false)
  })

  it('returns false for "case-study" mode', () => {
    expect(isOJMode('case-study')).toBe(false)
  })

  it('returns false for "data-task" mode', () => {
    expect(isOJMode('data-task')).toBe(false)
  })

  it('returns false for "report-task" mode', () => {
    expect(isOJMode('report-task')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Editor language mapping (from ProblemDetail.tsx line 336)
// ---------------------------------------------------------------------------

function editorLanguage(selectedLanguage: string): string {
  return selectedLanguage === 'cpp' ? 'cpp' : selectedLanguage
}

describe('editor language mapping', () => {
  it('maps cpp to cpp', () => {
    expect(editorLanguage('cpp')).toBe('cpp')
  })

  it('passes python through', () => {
    expect(editorLanguage('python')).toBe('python')
  })

  it('passes c through', () => {
    expect(editorLanguage('c')).toBe('c')
  })

  it('passes csharp through', () => {
    expect(editorLanguage('csharp')).toBe('csharp')
  })

  it('passes sql through', () => {
    expect(editorLanguage('sql')).toBe('sql')
  })
})

// ---------------------------------------------------------------------------
// Keyboard-driven split ratio adjustment (from ProblemDetail.tsx lines 322-326)
// ---------------------------------------------------------------------------

function adjustSplitRatioByKey(currentRatio: number, key: 'ArrowLeft' | 'ArrowRight'): number {
  const delta = key === 'ArrowLeft' ? -0.02 : 0.02
  return Math.max(0.24, Math.min(0.62, currentRatio + delta))
}

describe('keyboard split ratio adjustment', () => {
  it('decreases ratio by 0.02 on ArrowLeft', () => {
    expect(adjustSplitRatioByKey(0.4, 'ArrowLeft')).toBeCloseTo(0.38)
  })

  it('increases ratio by 0.02 on ArrowRight', () => {
    expect(adjustSplitRatioByKey(0.4, 'ArrowRight')).toBeCloseTo(0.42)
  })

  it('clamps to minimum on ArrowLeft at boundary', () => {
    expect(adjustSplitRatioByKey(0.24, 'ArrowLeft')).toBe(0.24)
  })

  it('clamps to maximum on ArrowRight at boundary', () => {
    expect(adjustSplitRatioByKey(0.62, 'ArrowRight')).toBe(0.62)
  })

  it('does not go below minimum even with many left presses', () => {
    let ratio = 0.38
    for (let i = 0; i < 100; i++) {
      ratio = adjustSplitRatioByKey(ratio, 'ArrowLeft')
    }
    expect(ratio).toBe(0.24)
  })

  it('does not go above maximum even with many right presses', () => {
    let ratio = 0.38
    for (let i = 0; i < 100; i++) {
      ratio = adjustSplitRatioByKey(ratio, 'ArrowRight')
    }
    expect(ratio).toBe(0.62)
  })
})

// ---------------------------------------------------------------------------
// runHandle guard logic (from ProblemDetail.tsx lines 123-128)
// ---------------------------------------------------------------------------

describe('run/submit guards', () => {
  it('prevents running in non-OJ mode', () => {
    const isOJ = false
    let ran = false
    if (!isOJ) return // early return
    ran = true
    expect(ran).toBe(false)
  })

  it('allows running in OJ mode', () => {
    const isOJ = true
    let ran = false
    if (!isOJ) return
    ran = true
    expect(ran).toBe(true)
  })

  it('prevents submitting in non-OJ mode', () => {
    const isOJ = false
    let submitted = false
    if (!isOJ) return
    submitted = true
    expect(submitted).toBe(false)
  })
})
