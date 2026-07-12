import type { PracticeDraft } from '@/services/practiceService'
import type { DraftSnapshot } from './draftAutosave'
import type { DraftRecoveryEntry } from './draftRecovery'

export interface ResolvedPracticeDraft {
  snapshot: DraftSnapshot
  baseRevision: number
  localVersion: number
  dirty: boolean
  autosave: boolean
  conflict: boolean
  discardRecovery: boolean
}

function durableSnapshot(
  draft: PracticeDraft | null,
  starterCode: string,
  preferredLanguage: string,
): DraftSnapshot {
  if (!draft || draft.deleted) return { code: starterCode, language: preferredLanguage }
  return { code: draft.code, language: draft.language || preferredLanguage }
}

function sameSnapshot(left: DraftSnapshot, right: DraftSnapshot): boolean {
  return left.code === right.code && left.language === right.language
}

export function resolvePracticeDraft(
  draft: PracticeDraft | null,
  recovery: DraftRecoveryEntry | null,
  starterCode: string,
  preferredLanguage: string,
): ResolvedPracticeDraft {
  const baseRevision = draft?.revision ?? 0
  const durable = durableSnapshot(draft, starterCode, preferredLanguage)
  if (!recovery) {
    return {
      snapshot: durable,
      baseRevision,
      localVersion: 1,
      dirty: false,
      autosave: false,
      conflict: false,
      discardRecovery: false,
    }
  }

  const recovered: DraftSnapshot = {
    code: recovery.code,
    language: recovery.language || preferredLanguage,
  }
  if (!draft && (recovery.baseRevision === 0 || recovery.legacy)) {
    return {
      snapshot: recovered,
      baseRevision: 0,
      localVersion: recovery.localVersion,
      dirty: true,
      autosave: true,
      conflict: false,
      discardRecovery: false,
    }
  }

  if (!draft?.deleted && sameSnapshot(recovered, durable)) {
    return {
      snapshot: durable,
      baseRevision,
      localVersion: recovery.localVersion,
      dirty: false,
      autosave: false,
      conflict: false,
      discardRecovery: true,
    }
  }

  if (!recovery.legacy && recovery.baseRevision === baseRevision) {
    return {
      snapshot: recovered,
      baseRevision,
      localVersion: recovery.localVersion,
      dirty: true,
      autosave: true,
      conflict: false,
      discardRecovery: false,
    }
  }

  return {
    snapshot: recovered,
    baseRevision: recovery.baseRevision ?? 0,
    localVersion: recovery.localVersion,
    dirty: true,
    autosave: false,
    conflict: true,
    discardRecovery: false,
  }
}
