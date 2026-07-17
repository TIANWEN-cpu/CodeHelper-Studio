export interface AppCloseFlushResult {
  ok: boolean
  error?: string
  recoveryAvailable?: boolean
}

type AppCloseFlushHandler = () => Promise<AppCloseFlushResult | boolean | void>

interface CloseLifecycleApi {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

const flushHandlers = new Map<string, AppCloseFlushHandler>()

export function registerAppCloseFlushHandler(
  id: string,
  handler: AppCloseFlushHandler,
): () => void {
  flushHandlers.set(id, handler)
  return () => {
    if (flushHandlers.get(id) === handler) flushHandlers.delete(id)
  }
}

export async function flushBeforeAppClose(): Promise<AppCloseFlushResult> {
  const errors: string[] = []
  let everyFailureHasRecovery = true
  await Promise.all(
    [...flushHandlers.entries()].map(async ([id, handler]) => {
      try {
        const result = await handler()
        if (result === false) {
          errors.push(`${id} 未完成持久化`)
          everyFailureHasRecovery = false
        } else if (result && typeof result === 'object' && !result.ok) {
          errors.push(result.error?.trim() || `${id} 未完成持久化`)
          if (result.recoveryAvailable !== true) everyFailureHasRecovery = false
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${id} 持久化失败`)
        everyFailureHasRecovery = false
      }
    }),
  )
  return errors.length > 0
    ? { ok: false, error: errors.join('；'), recoveryAvailable: everyFailureHasRecovery }
    : { ok: true }
}

export function bindAppCloseLifecycle(api: CloseLifecycleApi = window.api): () => void {
  return api.on('app-before-close', (...args: unknown[]) => {
    const payload = args[0]
    if (!payload || typeof payload !== 'object') return
    const requestId = (payload as { requestId?: unknown }).requestId
    if (typeof requestId !== 'string' || !requestId) return
    void flushBeforeAppClose()
      .then((result) => api.invoke('app-close-flush-complete', { requestId, ...result }))
      .catch(() => undefined)
  })
}
