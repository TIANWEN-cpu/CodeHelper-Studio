interface LifecycleEventTarget {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

interface VisibilityEventTarget extends LifecycleEventTarget {
  visibilityState: string
}

/** Starts a best-effort durable flush whenever the renderer is about to become unavailable. */
export function bindDraftFlushLifecycle(
  flush: () => Promise<void>,
  pageTarget: LifecycleEventTarget = window,
  visibilityTarget: VisibilityEventTarget = document,
): () => void {
  const startFlush = () => {
    void flush().catch(() => undefined)
  }
  const flushWhenHidden = () => {
    if (visibilityTarget.visibilityState === 'hidden') startFlush()
  }

  pageTarget.addEventListener('pagehide', startFlush)
  pageTarget.addEventListener('beforeunload', startFlush)
  visibilityTarget.addEventListener('visibilitychange', flushWhenHidden)

  return () => {
    pageTarget.removeEventListener('pagehide', startFlush)
    pageTarget.removeEventListener('beforeunload', startFlush)
    visibilityTarget.removeEventListener('visibilitychange', flushWhenHidden)
  }
}
