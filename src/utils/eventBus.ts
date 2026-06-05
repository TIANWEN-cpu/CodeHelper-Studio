type EventPayloads = {
  'theme:changed': string
  'settings:updated': unknown
  'chat:message': unknown
  'layout:changed': unknown
}

type EventName = keyof EventPayloads | string
type Listener<T = unknown> = (payload: T) => void

const MAX_LISTENERS = 50

class EventBus {
  private listeners = new Map<EventName, Set<Listener>>()

  on<T = unknown>(event: EventName, listener: Listener<T>): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener>()
    set.add(listener as Listener)
    this.listeners.set(event, set)
    if (set.size > MAX_LISTENERS) {
      console.warn(`[eventBus] Max listeners (${MAX_LISTENERS}) exceeded for "${event}"`)
    }
    return () => this.off(event, listener as Listener)
  }

  once<T = unknown>(event: EventName, listener: Listener<T>): () => void {
    const wrapped: Listener<T> = (payload) => {
      this.off(event, wrapped as Listener)
      listener(payload)
    }
    return this.on(event, wrapped)
  }

  off(event?: EventName, listener?: Listener): void {
    if (event == null) {
      this.listeners.clear()
      return
    }
    if (listener == null) {
      this.listeners.delete(event)
      return
    }
    const set = this.listeners.get(event)
    if (!set) return
    set.delete(listener)
    if (set.size === 0) this.listeners.delete(event)
  }

  emit<T = unknown>(event: EventName, payload?: T): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of set) {
      try {
        listener(payload)
      } catch (error) {
        console.error('[EventBus] listener failed:', error)
      }
    }
  }

  listenerCount(event: EventName): number {
    return this.listeners.get(event)?.size ?? 0
  }

  hasListeners(event: EventName): boolean {
    return this.listenerCount(event) > 0
  }
}

export const eventBus = new EventBus()
export type { EventBus }
