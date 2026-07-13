import { describe, expect, it } from 'vitest'
import {
  AnimationFrameReporter,
  cursorOffsetFromPosition,
  normalizeEditorCursorPosition,
} from '../src/utils/editorViewState'

describe('editor view state', () => {
  it('converts a one-based line and column into a document offset', () => {
    expect(cursorOffsetFromPosition('alpha\nbeta\ngamma', { lineNumber: 2, column: 3 })).toBe(8)
  })

  it('clamps restored positions to the nearest valid character boundary', () => {
    expect(cursorOffsetFromPosition('alpha\nbeta', { lineNumber: 20, column: 20 })).toBe(10)
    expect(cursorOffsetFromPosition('alpha\nbeta', { lineNumber: 1, column: 20 })).toBe(5)
  })

  it('uses CodeMirror line offsets for CRLF and bare CR documents', () => {
    expect(cursorOffsetFromPosition('a\r\nb\r\nc', { lineNumber: 3, column: 2 })).toBe(5)
    expect(cursorOffsetFromPosition('a\rb\rc', { lineNumber: 3, column: 2 })).toBe(5)
  })

  it('normalizes persisted cursor coordinates to one-based integers', () => {
    expect(normalizeEditorCursorPosition({ lineNumber: 0, column: -2 })).toEqual({
      lineNumber: 1,
      column: 1,
    })
    expect(normalizeEditorCursorPosition({ lineNumber: 1.5, column: 2 })).toBeNull()
  })

  it('flushes only the pending scroll value when a document session is disposed', () => {
    const reports: number[] = []
    const frames = new Map<number, FrameRequestCallback>()
    const cancelled: number[] = []
    let nextFrame = 1
    const reporter = new AnimationFrameReporter<number>(
      (value) => reports.push(value),
      (callback) => {
        const handle = nextFrame++
        frames.set(handle, callback)
        return handle
      },
      (handle) => {
        cancelled.push(handle)
        frames.delete(handle)
      },
    )

    reporter.dispose()
    expect(reports).toEqual([])

    reporter.update(120)
    reporter.update(240)
    reporter.dispose()

    expect(reports).toEqual([240])
    expect(cancelled).toEqual([1])
    expect(frames.size).toBe(0)
  })

  it('keeps pending scroll reports bound to the document that created them', () => {
    const reports: string[] = []
    const requestFrame = () => 1
    const cancelFrame = () => undefined
    const tabA = new AnimationFrameReporter<number>(
      (value) => reports.push(`a:${value}`),
      requestFrame,
      cancelFrame,
    )
    const tabB = new AnimationFrameReporter<number>(
      (value) => reports.push(`b:${value}`),
      requestFrame,
      cancelFrame,
    )

    tabA.update(80)
    tabB.update(160)
    tabA.dispose()
    tabB.dispose()

    expect(reports).toEqual(['a:80', 'b:160'])
  })
})
