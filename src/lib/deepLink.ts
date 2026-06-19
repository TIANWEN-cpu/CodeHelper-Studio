// deepLink.ts
// 跨视图深链：命令面板等处「跳到某节课/某道练习」时，先切换视图，
// 再把目标投递给目标视图。视图按需懒加载，切换后才挂载，所以用
// sessionStorage 暂存 pending（挂载时消费）+ CustomEvent 实时通知
// （视图已挂载时即时响应）。沿用 ProfileView→Settings 的既有模式。

export type DeepLinkTarget =
  | { kind: 'lesson'; id: string }
  | { kind: 'exercise'; id: string }
  | { kind: 'knowledge'; id: string }

const PENDING_KEY = 'codehelper.pendingDeepLink'
const EVENT = 'codehelper:deep-link'

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

/** 投递一个深链目标：写入 pending 并广播事件。 */
export function requestDeepLink(target: DeepLinkTarget): void {
  if (!hasWindow()) return
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(target))
  } catch {
    /* 隐私模式等 sessionStorage 不可用时，仍可走实时事件 */
  }
  window.dispatchEvent(new CustomEvent<DeepLinkTarget>(EVENT, { detail: target }))
}

/**
 * 视图挂载时消费与自己匹配的 pending 目标（消费即清除）。
 * kind 不匹配则原样保留，留给对应视图。
 */
export function consumePendingDeepLink(kind: DeepLinkTarget['kind']): string | null {
  if (!hasWindow()) return null
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DeepLinkTarget
    if (parsed?.kind !== kind || typeof parsed.id !== 'string') return null
    window.sessionStorage.removeItem(PENDING_KEY)
    return parsed.id
  } catch {
    // 损坏的记录直接清掉，避免反复读到脏数据
    try {
      window.sessionStorage.removeItem(PENDING_KEY)
    } catch {
      /* ignore */
    }
    return null
  }
}

/**
 * 订阅实时深链事件（视图已挂载时使用）。返回取消订阅函数。
 * 只把匹配 kind 的目标透传给 handler。
 */
export function subscribeDeepLink(
  kind: DeepLinkTarget['kind'],
  handler: (id: string) => void,
): () => void {
  if (!hasWindow()) return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<DeepLinkTarget>).detail
    if (detail?.kind === kind && typeof detail.id === 'string') handler(detail.id)
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
