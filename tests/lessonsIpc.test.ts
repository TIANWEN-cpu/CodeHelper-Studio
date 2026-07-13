import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

const mockDB = {
  prepare: vi.fn(),
}

vi.mock('../electron/db/index', () => ({
  getDB: () => mockDB,
}))

const courseMap = {
  tracks: [
    {
      id: 'track-1',
      title: 'Track',
      icon: 'code',
      summary: 'Summary',
      modules: [
        {
          id: 'module-1',
          title: 'Module',
          summary: 'Summary',
          lessons: [
            {
              id: 'lesson-1',
              title: 'Array Basics',
              summary: 'Learn arrays',
              path: 'array-basics.md',
              difficulty: 'beginner',
              estimated_minutes: 10,
              tags: ['arrays'],
              prerequisites: [],
              outcomes: [],
            },
          ],
        },
      ],
    },
  ],
}

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn((path: unknown) =>
    String(path).endsWith('course_map.json') ? JSON.stringify(courseMap) : '# Lesson',
  ),
}))

vi.mock('../electron/utils/perfMonitor', () => ({
  trackPerformance: (_name: string, handler: (...args: unknown[]) => unknown) => handler,
}))

beforeAll(() => {
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: 'C:\\resources',
  })
})

describe('lessons IPC contracts', () => {
  beforeEach(async () => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    mockDB.prepare.mockReset()
    const { registerLessonsIPC } = await import('../electron/ipc/lessons')
    registerLessonsIPC()
  })

  it('returns note content as the renderer string contract', () => {
    mockDB.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        lesson_id: 'lesson-1',
        content: 'saved note',
        tags: '["kept"]',
        code_snippets: '["print(1)"]',
        updated_at: '2026-01-01',
      })),
    })

    expect(handlers['lessons-notes-get'](null, 'lesson-1')).toBe('saved note')
  })

  it('returns an empty note when no record exists', () => {
    mockDB.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })
    expect(handlers['lessons-notes-get'](null, 'lesson-1')).toBe('')
  })

  it('preserves stored tags and snippets when saving note text', () => {
    const run = vi.fn()
    mockDB.prepare.mockImplementation((sql: string) => {
      expect(sql).toContain('content = excluded.content')
      expect(sql).not.toContain('tags = excluded.tags')
      expect(sql).not.toContain('code_snippets = excluded.code_snippets')
      return { run }
    })

    handlers['lessons-notes-save'](null, 'lesson-1', 'updated note')
    expect(run).toHaveBeenCalledWith('lesson-1', 'updated note', '[]', '[]', expect.any(String))
  })

  it('returns lesson ids from search rather than internal result objects', () => {
    expect(handlers['lessons-search'](null, 'arrays')).toEqual(['lesson-1'])
  })
})
