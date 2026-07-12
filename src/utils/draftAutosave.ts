export type DraftSaveFunction = (exerciseId: string, code: string) => Promise<void>

interface DraftAutosaveOptions {
  delayMs?: number
  onSavingChange?: (saving: boolean) => void
  onError?: (error: unknown) => void
  onSaved?: (exerciseId: string, code: string) => void
}

const DEFAULT_DELAY_MS = 2_000

/** Serializes draft writes and keeps an edit dirty until that exact revision is persisted. */
export class DraftAutosaveCoordinator {
  private exerciseId: string | null = null
  private code = ''
  private revision = 0
  private persistedRevision = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private saveChain: Promise<void> = Promise.resolve()
  private inFlight: { exerciseId: string; revision: number; promise: Promise<void> } | null = null
  private savingCount = 0

  constructor(
    private readonly save: DraftSaveFunction,
    private readonly options: DraftAutosaveOptions = {},
  ) {}

  setActive(exerciseId: string, code: string): void {
    this.clearTimer()
    this.exerciseId = exerciseId
    this.code = code
    this.revision += 1
    this.persistedRevision = this.revision
  }

  update(code: string): void {
    this.code = code
    this.revision += 1
    this.schedule()
  }
  async clearActive(
    clear: (exerciseId: string) => Promise<void>,
  ): Promise<{ exerciseId: string; code: string } | null> {
    this.clearTimer()
    const exerciseId = this.exerciseId
    if (!exerciseId) return null

    const revision = this.revision
    const code = this.code
    const previousPersistedRevision = this.persistedRevision
    this.persistedRevision = Math.max(this.persistedRevision, revision)

    const task = this.saveChain.catch(() => undefined).then(() => clear(exerciseId))
    this.saveChain = task
    try {
      await task
      return { exerciseId, code }
    } catch (error) {
      if (this.exerciseId === exerciseId && this.revision === revision) {
        this.persistedRevision = previousPersistedRevision
      }
      throw error
    }
  }

  hasPending(): boolean {
    return Boolean(this.exerciseId) && this.persistedRevision < this.revision
  }

  flush(): Promise<void> {
    this.clearTimer()
    const exerciseId = this.exerciseId
    const revision = this.revision
    const code = this.code
    if (!exerciseId || this.persistedRevision >= revision) return Promise.resolve()
    if (this.inFlight?.exerciseId === exerciseId && this.inFlight.revision === revision) {
      return this.inFlight.promise
    }

    const operation = this.persist(exerciseId, code, revision)
    const tracked = operation.finally(() => {
      if (this.inFlight?.promise === tracked) this.inFlight = null
    })
    this.inFlight = { exerciseId, revision, promise: tracked }
    return tracked
  }

  private async persist(exerciseId: string, code: string, revision: number): Promise<void> {
    this.savingCount += 1
    if (this.savingCount === 1) this.options.onSavingChange?.(true)
    const task = this.saveChain.catch(() => undefined).then(() => this.save(exerciseId, code))
    this.saveChain = task

    try {
      await task
      if (this.exerciseId === exerciseId) {
        this.persistedRevision = Math.max(this.persistedRevision, revision)
      }
      this.options.onSaved?.(exerciseId, code)
    } catch (error) {
      this.options.onError?.(error)
      throw error
    } finally {
      this.savingCount -= 1
      if (this.savingCount === 0) this.options.onSavingChange?.(false)
    }
  }

  /** Starts the final write immediately; callers may intentionally fire-and-forget on unmount. */
  dispose(): Promise<void> {
    return this.flush()
  }

  private schedule(): void {
    this.clearTimer()
    if (!this.exerciseId) return
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
