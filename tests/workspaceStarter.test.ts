import { describe, expect, it } from 'vitest'
import { isEmptyEditorDocument } from '../src/utils/workspaceStarter'

describe('workspace starter initialization', () => {
  it('initializes only a truly empty or whitespace-only document', () => {
    expect(isEmptyEditorDocument('')).toBe(true)
    expect(isEmptyEditorDocument('  \n\t')).toBe(true)
  })

  it('never treats welcome, default, or user code as replaceable starter space', () => {
    expect(isEmptyEditorDocument('# Welcome\nprint("hello")\n')).toBe(false)
    expect(isEmptyEditorDocument('print("Hello, CodeHelper")')).toBe(false)
    expect(isEmptyEditorDocument('// user typed this')).toBe(false)
  })
})
