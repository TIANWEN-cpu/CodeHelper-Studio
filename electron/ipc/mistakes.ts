import { ipcMain } from 'electron'
import { getDB } from '../db/index'

export function registerMistakesIPC() {
  ipcMain.handle('mistakes-list', () => {
    return getDB().prepare(`
      SELECT m.*, p.title, p.difficulty, p.tags
      FROM mistakes m
      JOIN problems p ON m.problem_id = p.id
      ORDER BY m.updated_at DESC
    `).all()
  })

  ipcMain.handle('mistakes-get', (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
    return getDB().prepare(`
      SELECT m.*, p.title, p.description, p.difficulty, p.tags, p.starter_code
      FROM mistakes m
      JOIN problems p ON m.problem_id = p.id
      WHERE m.id = ?
    `).get(id)
  })

  ipcMain.handle('mistakes-update-analysis', (_e, id: number, analysis: string) => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
    if (typeof analysis !== 'string') throw new Error('参数无效: analysis')
    analysis = analysis.slice(0, 50000)
    getDB().prepare('UPDATE mistakes SET ai_analysis = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(analysis, id)
  })

  ipcMain.handle('mistakes-delete', (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
    getDB().prepare('DELETE FROM mistakes WHERE id = ?').run(id)
  })
}
