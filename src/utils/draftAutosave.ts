export interface DraftSnapshot {
  code: string
  language: string
}

export interface DraftSaveReceipt {
  revision: number
  updatedAt: string
}

export interface DraftSavedEvent extends DraftSaveReceipt {
  exerciseId: string
  saved: DraftSnapshot
  pending: DraftSnapshot | null
  pendingLocalVersion: number | null
}

export type DraftSaveFunction = (
  exerciseId: string,
  snapshot: DraftSnapshot,
  baseRevision: number,
) => Promise<DraftSaveReceipt>

interface DraftAutosaveOptions {
  delayMs?: number
  onSavingChange?: (saving: boolean) => void
  onError?: (error: unknown) => void
  onSaved?: (event: DraftSavedEvent) => void
}

export class DraftConflictError extends Error {
  constructor(message = '草稿版本冲突，请选择保留本地修改或重新加载已保存版本') {
    super(message)
    this.name = 'DraftConflictError'
  }
}

interface ActiveDraftState {
  exerciseId: string
  snapshot: DraftSnapshot
  localVersion: number
  persistedLocalVersion: number
  baseRevision: number
  conflict: DraftConflictError | null
}

const DEFAULT_DELAY_MS = 2_000

function sameSnapshot(left: DraftSnapshot, right: DraftSnapshot): boolean {
  return left.code === right.code && left.language === right.language
}

/** Serializes draft writes and always advances the latest local snapshot from the newest server revision. */
export class DraftAutosaveCoordinator {
  private active: ActiveDraftState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private worker: Promise<void> | null = null
  private clearing = false
  private retryBlocked = false

  constructor(
    private readonly save: DraftSaveFunction,
    private readonly options: DraftAutosaveOptions = {},
  ) {}

  setActive(
    exerciseId: string,
    snapshot: DraftSnapshot,
    baseRevision: number,
    options: {
      dirty?: boolean
      localVersion?: number
      autosave?: boolean
      conflict?: boolean
    } = {},
  ): void {
    this.clearTimer()
    const localVersion = Math.max(1, options.localVersion ?? 1)
    this.active = {
      exerciseId,
      snapshot,
      localVersion,
      persistedLocalVersion: options.dirty ? localVersion - 1 : localVersion,
      baseRevision,
      conflict: options.conflict ? new DraftConflictError() : null,
    }
    this.retryBlocked = false
    if (options.dirty && options.autosave !== false) this.schedule()
  }

  update(snapshot: DraftSnapshot): void {
    if (!this.active || sameSnapshot(this.active.snapshot, snapshot)) return
    this.active.snapshot = snapshot
    this.active.localVersion += 1
    this.retryBlocked = false
    if (!this.active.conflict && !this.clearing) this.schedule()
  }

  getState(): Readonly<ActiveDraftState> | null {
    if (!this.active) return null
    return {
      ...this.active,
      snapshot: { ...this.active.snapshot },
    }
  }

  hasPending(): boolean {
    return Boolean(this.active && this.active.persistedLocalVersion < this.active.localVersion)
  }

  hasConflict(): boolean {
    return Boolean(this.active?.conflict)
  }

  resolveConflict(baseRevision: number): void {
    if (!this.active?.conflict) return
    this.active.baseRevision = baseRevision
    this.active.conflict = null
    this.retryBlocked = false
    if (this.hasPending()) this.schedule()
  }

  async flush(): Promise<void> {
    this.clearTimer()
    if (this.active?.conflict) throw this.active.conflict
    if (!this.hasPending()) return
    this.retryBlocked = false
    this.startWorker()
    await this.worker
    if (this.active?.conflict) throw this.active.conflict
  }

  async clearActive(
    clear: (exerciseId: string, baseRevision: number) => Promise<DraftSaveReceipt>,
  ): Promise<{ exerciseId: string; snapshot: DraftSnapshot; receipt: DraftSaveReceipt } | null> {
    const active = this.active
    if (!active) return null
    this.clearing = true
    this.clearTimer()
    try {
      await this.flush()
      if (!this.active || this.active.exerciseId !== active.exerciseId) return null
      const clearedLocalVersion = this.active.localVersion
      const snapshot = { ...this.active.snapshot }
      const receipt = await clear(this.active.exerciseId, this.active.baseRevision)
      if (!this.active || this.active.exerciseId !== active.exerciseId) return null
      this.active.baseRevision = receipt.revision
      this.active.persistedLocalVersion = Math.max(
        this.active.persistedLocalVersion,
        clearedLocalVersion,
      )
      this.active.conflict = null
      return { exerciseId: active.exerciseId, snapshot, receipt }
    } catch (error) {
      if (error instanceof DraftConflictError && this.active?.exerciseId === active.exerciseId) {
        this.active.conflict = error
      }
      this.options.onError?.(error)
      throw error
    } finally {
      this.clearing = false
      if (this.hasPending() && !this.hasConflict()) this.schedule()
    }
  }

  /** Starts the final write immediately; callers may intentionally fire-and-forget on unmount. */
  dispose(): Promise<void> {
    return this.flush()
  }

  /**
   * Drops the active in-memory draft after the caller has independently confirmed
   * that either SQLite or the recovery log contains the latest snapshot.
   */
  deactivate(): void {
    this.clearTimer()
    this.active = null
    this.retryBlocked = false
  }

  private startWorker(): void {
    if (this.worker) return
    this.worker = this.runWorker().finally(() => {
      this.worker = null
      this.options.onSavingChange?.(false)
      if (this.hasPending() && !this.hasConflict() && !this.clearing && !this.retryBlocked) {
        this.schedule()
      }
    })
  }

  private async runWorker(): Promise<void> {
    this.options.onSavingChange?.(true)
    while (this.active && this.hasPending() && !this.active.conflict) {
      const exerciseId = this.active.exerciseId
      const localVersion = this.active.localVersion
      const snapshot = { ...this.active.snapshot }
      const baseRevision = this.active.baseRevision
      try {
        const receipt = await this.save(exerciseId, snapshot, baseRevision)
        this.retryBlocked = false
        if (!this.active || this.active.exerciseId !== exerciseId) continue
        this.active.baseRevision = receipt.revision
        this.active.persistedLocalVersion = Math.max(
          this.active.persistedLocalVersion,
          localVersion,
        )
        const stillPending = this.hasPending()
        this.options.onSaved?.({
          exerciseId,
          saved: snapshot,
          revision: receipt.revision,
          updatedAt: receipt.updatedAt,
          pending: stillPending ? { ...this.active.snapshot } : null,
          pendingLocalVersion: stillPending ? this.active.localVersion : null,
        })
      } catch (error) {
        if (error instanceof DraftConflictError && this.active?.exerciseId === exerciseId) {
          this.active.conflict = error
        } else {
          this.retryBlocked = true
        }
        this.options.onError?.(error)
        throw error
      }
    }
  }

  private schedule(): void {
    this.clearTimer()
    if (!this.active || this.active.conflict || this.clearing || this.retryBlocked) return
    this.timer = setTimeout(() => {
      void this.flush().catch(() => undefined)
    }, this.options.delayMs ?? DEFAULT_DELAY_MS)
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
