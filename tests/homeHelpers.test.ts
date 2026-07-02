// home.ts 顶层 import electron/db/fs/perfMonitor，且模块加载时用 process.resourcesPath
// 拼 CONTENT_DIR_CANDIDATES（Node 测试环境无此属性）。用 vi.hoisted 在模块加载前 stub 它。
vi.hoisted(() => {
  ;(process as { resourcesPath?: string }).resourcesPath = ''
})
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../electron/db/index', () => ({ getDB: vi.fn() }))
vi.mock('../electron/utils/perfMonitor', () => ({ trackPerformance: vi.fn() }))

import { describe, it, expect } from 'vitest'
import { computeLevel, getFirstLesson } from '../electron/ipc/home'

describe('computeLevel (XP → 等级曲线)', () => {
  it('xp=0 时为 1 级，0/50 进度', () => {
    expect(computeLevel(0)).toEqual({ level: 1, xpInLevel: 0, xpForNextLevel: 50 })
  })

  it('xp=50 恰好升到 2 级（满级后归零）', () => {
    expect(computeLevel(50)).toEqual({ level: 2, xpInLevel: 0, xpForNextLevel: 150 })
  })

  it('xp=200 升到 3 级', () => {
    expect(computeLevel(200)).toEqual({ level: 3, xpInLevel: 0, xpForNextLevel: 250 })
  })

  it('xp=450 升到 4 级', () => {
    expect(computeLevel(450)).toEqual({ level: 4, xpInLevel: 0, xpForNextLevel: 350 })
  })

  it('级内进度正确（xp=49 → 1级 49/50）', () => {
    expect(computeLevel(49)).toEqual({ level: 1, xpInLevel: 49, xpForNextLevel: 50 })
  })

  it('刚过阈值（xp=51 → 2级 1/150）', () => {
    expect(computeLevel(51)).toEqual({ level: 2, xpInLevel: 1, xpForNextLevel: 150 })
  })

  it('负 xp 被钳制为 0', () => {
    expect(computeLevel(-100)).toEqual({ level: 1, xpInLevel: 0, xpForNextLevel: 50 })
  })

  it('小数 xp 向下取整', () => {
    expect(computeLevel(50.9).xpInLevel).toBe(0) // floor(50.9)=50 → 2级起点
  })

  it('level 与 xpInLevel + xpAtCurrent 一致（不变式）', () => {
    for (const xp of [0, 30, 100, 250, 1000, 5000]) {
      const r = computeLevel(xp)
      expect(r.xpInLevel).toBeGreaterThanOrEqual(0)
      expect(r.xpInLevel).toBeLessThan(r.xpForNextLevel)
      expect(r.level).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('getFirstLesson', () => {
  it('返回课程地图中第一条课程', () => {
    const courseMap = {
      tracks: [
        {
          id: 'py',
          title: 'Python',
          icon: 'i',
          summary: '',
          modules: [
            {
              id: 'm1',
              title: '基础',
              summary: '',
              lessons: [
                {
                  id: 'lesson-1',
                  title: '第一课',
                  summary: '',
                  path: '',
                  difficulty: 'easy',
                  estimated_minutes: 10,
                  tags: [],
                  prerequisites: [],
                  outcomes: [],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = getFirstLesson(courseMap as never)
    expect(result).toEqual({
      trackId: 'py',
      moduleId: 'm1',
      lessonId: 'lesson-1',
      title: '第一课',
      moduleTitle: '基础',
    })
  })

  it('跳过空模块，找到第一个有课程 的模块', () => {
    const courseMap = {
      tracks: [
        {
          id: 't1',
          title: 'T1',
          icon: 'i',
          summary: '',
          modules: [
            { id: 'empty', title: '空', summary: '', lessons: [] },
            {
              id: 'm2',
              title: 'M2',
              summary: '',
              lessons: [
                {
                  id: 'l2',
                  title: '课2',
                  summary: '',
                  path: '',
                  difficulty: 'easy',
                  estimated_minutes: 5,
                  tags: [],
                  prerequisites: [],
                  outcomes: [],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(getFirstLesson(courseMap as never)?.moduleId).toBe('m2')
  })

  it('无任何课程时返回 null', () => {
    expect(getFirstLesson({ tracks: [] } as never)).toBeNull()
    expect(
      getFirstLesson({
        tracks: [{ id: 't', title: '', icon: '', summary: '', modules: [] }],
      } as never),
    ).toBeNull()
  })
})
