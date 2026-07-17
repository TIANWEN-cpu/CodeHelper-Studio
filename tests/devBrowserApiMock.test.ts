import { describe, expect, it } from 'vitest'
import { invokeDevBrowserApiMock } from '../src/devBrowserApiMock'

interface SavedBrowserDraft {
  status: 'saved'
  draft: {
    title: string | null
    code: string
    revision: number
  }
}

describe('development browser practice draft mock', () => {
  it('matches the real title preservation and idempotent retry contract', async () => {
    const exerciseId = 'browser-title-contract'
    const created = (await invokeDevBrowserApiMock('exercises-draft-save', {
      exerciseId,
      title: 'Browser exercise',
      code: 'print(1)',
      language: 'python',
      baseRevision: 0,
    })) as SavedBrowserDraft
    expect(created).toMatchObject({
      status: 'saved',
      draft: { title: 'Browser exercise', code: 'print(1)', revision: 1 },
    })

    const updated = (await invokeDevBrowserApiMock('exercises-draft-save', {
      exerciseId,
      code: 'print(2)',
      language: 'python',
      baseRevision: 1,
    })) as SavedBrowserDraft
    expect(updated.draft).toMatchObject({ title: 'Browser exercise', revision: 2 })

    const retry = (await invokeDevBrowserApiMock('exercises-draft-save', {
      exerciseId,
      code: 'print(2)',
      language: 'python',
      baseRevision: 1,
    })) as SavedBrowserDraft
    expect(retry.draft).toMatchObject({ title: 'Browser exercise', revision: 2 })

    const clearedDraft = (await invokeDevBrowserApiMock('exercises-draft-clear', {
      exerciseId,
      baseRevision: 2,
    })) as SavedBrowserDraft
    expect(clearedDraft.draft).toMatchObject({ title: 'Browser exercise', revision: 3 })

    const clearedTitle = (await invokeDevBrowserApiMock('exercises-draft-save', {
      exerciseId,
      title: null,
      code: 'print(3)',
      language: 'python',
      baseRevision: 3,
    })) as SavedBrowserDraft
    expect(clearedTitle.draft).toMatchObject({ title: null, revision: 4 })

    const clearedTitleRetry = (await invokeDevBrowserApiMock('exercises-draft-save', {
      exerciseId,
      title: null,
      code: 'print(3)',
      language: 'python',
      baseRevision: 3,
    })) as SavedBrowserDraft
    expect(clearedTitleRetry.draft).toMatchObject({ title: null, revision: 4 })
  })
})

describe('development browser maintenance mock', () => {
  it('returns structured fail-closed results for desktop-only import and export', async () => {
    await expect(invokeDevBrowserApiMock('export-data', ['settings'])).resolves.toEqual({
      success: false,
      error: '浏览器预览不提供桌面文件导出',
    })
    await expect(invokeDevBrowserApiMock('import-data')).resolves.toEqual({
      success: false,
      imported: {},
      skipped: {},
      errors: ['浏览器预览不提供 SQLite 便携数据导入'],
    })
  })
})
