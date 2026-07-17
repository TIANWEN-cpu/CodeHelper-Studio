export interface WindowCloseFlushResult {
  ok: boolean
  error?: string
  recoveryAvailable?: boolean
}

interface PendingCloseRequest {
  senderId: number
  timer: ReturnType<typeof setTimeout>
  resolve: (result: WindowCloseFlushResult) => void
}

export class WindowCloseFlushBroker {
  private sequence = 0
  private readonly pending = new Map<string, PendingCloseRequest>()

  constructor(private readonly timeoutMs = 5_000) {}

  request(
    senderId: number,
    send: (payload: { requestId: string }) => void,
  ): Promise<WindowCloseFlushResult> {
    this.sequence += 1
    const requestId = `close-${senderId}-${Date.now()}-${this.sequence}`
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        resolve({ ok: false, error: '等待渲染进程保存超时' })
      }, this.timeoutMs)
      this.pending.set(requestId, { senderId, timer, resolve })
      try {
        send({ requestId })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(requestId)
        resolve({
          ok: false,
          error: error instanceof Error ? error.message : '无法请求渲染进程保存',
        })
      }
    })
  }

  resolve(senderId: number, payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return false
    const response = payload as {
      requestId?: unknown
      ok?: unknown
      error?: unknown
      recoveryAvailable?: unknown
    }
    if (typeof response.requestId !== 'string' || typeof response.ok !== 'boolean') return false
    const request = this.pending.get(response.requestId)
    if (!request || request.senderId !== senderId) return false
    clearTimeout(request.timer)
    this.pending.delete(response.requestId)
    request.resolve({
      ok: response.ok,
      ...(typeof response.error === 'string' && response.error.trim()
        ? { error: response.error.trim().slice(0, 1_000) }
        : {}),
      ...(typeof response.recoveryAvailable === 'boolean'
        ? { recoveryAvailable: response.recoveryAvailable }
        : {}),
    })
    return true
  }

  cancelSender(senderId: number): void {
    for (const [requestId, request] of this.pending) {
      if (request.senderId !== senderId) continue
      clearTimeout(request.timer)
      this.pending.delete(requestId)
      request.resolve({ ok: false, error: '窗口已在保存完成前关闭' })
    }
  }
}
