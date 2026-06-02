/**
 * Editor service — abstracts editor-related IPC calls.
 *
 * Wraps `run-code` IPC channel behind a clean interface
 * that can be mocked for testing.
 */

import { typedInvoke } from '../api/ipc'
import type { RunCodePayload, RunCodeResult } from '../types/ipc'

export interface IEditorService {
  runCode(payload: RunCodePayload): Promise<RunCodeResult>
  openExternal(url: string): Promise<void>
}

class EditorServiceImpl implements IEditorService {
  runCode(payload: RunCodePayload): Promise<RunCodeResult> {
    return typedInvoke('run-code', payload)
  }

  openExternal(url: string): Promise<void> {
    return typedInvoke('open-external', url)
  }
}

// ---------------------------------------------------------------------------
// Singleton with swappable implementation
// ---------------------------------------------------------------------------

let instance: IEditorService = new EditorServiceImpl()

export const editorService: IEditorService = {
  runCode: (...args) => instance.runCode(...args),
  openExternal: (...args) => instance.openExternal(...args),
}

/**
 * Replace the default editor service (useful for testing).
 */
export function setEditorService(service: IEditorService): void {
  instance = service
}
