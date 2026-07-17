export const EDITOR_WORKSPACE_STORAGE_VERSION = 4 as const

const MAX_EDITOR_TAB_ID_LENGTH = 200
const MAX_EDITOR_FILENAME_LENGTH = 255

export interface LegacyExerciseRecoverySource {
  id: string
  filename: string
  language: string
  content: string
  problemId?: string | null
}

export interface DraftBackedPracticeTabIdentity {
  id: string
  kind: 'file' | 'problem' | 'exercise'
}

export function isDraftBackedPracticeTab(tab: DraftBackedPracticeTabIdentity): boolean {
  return tab.kind === 'exercise' || (tab.kind === 'problem' && tab.id.startsWith('exercise-'))
}

export function stableEditorWorkspaceHash(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`
}

export function legacyExerciseRecoveryTabId(source: LegacyExerciseRecoverySource): string {
  const identity = source.problemId?.trim() || source.id
  const label = identity
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  const fingerprint = stableEditorWorkspaceHash(
    [source.id, source.problemId ?? '', source.filename, source.language, source.content].join(
      '\u0000',
    ),
  )
  return `recovered-exercise-${label || 'unknown'}-${fingerprint}`.slice(
    0,
    MAX_EDITOR_TAB_ID_LENGTH,
  )
}

export function legacyExerciseRecoveryFilename(filename: string): string {
  const normalized = filename.trim() || 'exercise.txt'
  const extensionIndex = normalized.lastIndexOf('.')
  const extension = extensionIndex > 0 ? normalized.slice(extensionIndex) : ''
  const stem = extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized
  const marker = '.recovered'
  const extensionBudget = Math.max(0, MAX_EDITOR_FILENAME_LENGTH - marker.length - 1)
  const suffix = `${marker}${extension.slice(0, extensionBudget)}`
  const stemBudget = Math.max(1, MAX_EDITOR_FILENAME_LENGTH - suffix.length)
  return `${stem.slice(0, stemBudget)}${suffix}`.slice(0, MAX_EDITOR_FILENAME_LENGTH)
}
