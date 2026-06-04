import { ipcMain } from 'electron'
import { getDB } from '../db/index'

export function registerMistakesIPC(): void {
  ipcMain.handle('mistakes-list', () => {
    return getDB()
      .prepare(
        `
      SELECT m.*, p.title, p.difficulty, p.tags
      FROM mistakes m
      JOIN problems p ON m.problem_id = p.id
      ORDER BY m.updated_at DESC
    `,
      )
      .all()
  })

  ipcMain.handle('mistakes-get', (_e, id: string) => {
    const numId = typeof id === 'string' ? parseInt(id, 10) : typeof id === 'number' ? id : NaN
    if (!Number.isFinite(numId) || numId < 1) throw new Error('参数无效: id')
    return getDB()
      .prepare(
        `
      SELECT m.*, p.title, p.description, p.difficulty, p.tags, p.starter_code
      FROM mistakes m
      JOIN problems p ON m.problem_id = p.id
      WHERE m.id = ?
    `,
      )
      .get(numId)
  })

  ipcMain.handle('mistakes-update-analysis', (_e, id: string, analysis: string) => {
    const numId = typeof id === 'string' ? parseInt(id, 10) : typeof id === 'number' ? id : NaN
    if (!Number.isFinite(numId) || numId < 1) throw new Error('参数无效: id')
    if (typeof analysis !== 'string') throw new Error('参数无效: analysis')
    analysis = analysis.slice(0, 50000)
    getDB()
      .prepare('UPDATE mistakes SET ai_analysis = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(analysis, numId)
  })

  ipcMain.handle('mistakes-delete', (_e, id: string) => {
    const numId = typeof id === 'string' ? parseInt(id, 10) : typeof id === 'number' ? id : NaN
    if (!Number.isFinite(numId) || numId < 1) throw new Error('参数无效: id')
    getDB().prepare('DELETE FROM mistakes WHERE id = ?').run(numId)
  })
}
