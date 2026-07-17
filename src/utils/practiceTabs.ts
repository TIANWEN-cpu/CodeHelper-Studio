import type { EditorTab, EditorTabKind } from '@/stores/editorStore'
import { isDraftBackedPracticeTab } from '@/shared/editorWorkspaceContract'

export function practiceTabKind(sourceType: 'exercise' | 'problem' | undefined): EditorTabKind {
  return sourceType === 'problem' ? 'problem' : 'exercise'
}

export function isPracticeTab(tab: Pick<EditorTab, 'id' | 'kind'>): boolean {
  return isDraftBackedPracticeTab(tab)
}
