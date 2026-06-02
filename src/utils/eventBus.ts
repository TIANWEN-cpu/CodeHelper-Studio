/**
 * Typed event bus for cross-component communication.
 *
 * Provides a type-safe publish/subscribe system that decouples stores
 * and components from direct inter-store calls.
 *
 * Usage:
 * ```ts
 * import { eventBus, type AppEvents } from '../utils/eventBus'
 *
 * // Subscribe
 * const unsub = eventBus.on('theme:changed', (theme) => {
 *   console.log('New theme:', theme)
 * })
 *
 * // Publish
 * eventBus.emit('theme:changed', 'fjord')
 *
 * // One-shot listener
 * eventBus.once('session:created', (id) => { ... })
 *
 * // Unsubscribe
 * unsub()
 * ```
 */

// ---------------------------------------------------------------------------
// Event definitions — add new events here for full type safety
// ---------------------------------------------------------------------------

export interface AppEvents {
  // Theme events
  'theme:changed': string

  // Session events
  'session:created': string
  'session:switched': string
  'session:deleted': string

  // Problem events
  'problem:selected': number
  'problem:submitted': number
  'problems:refreshed': void

  // Editor events
  'editor:tab-opened': string
  'editor:tab-closed': string
  'editor:content-changed': { tabId: string; content: string }

  // AI events
  'ai:stream-start': string
  'ai:stream-chunk': { requestId: string; chunk: string }
  'ai:stream-done': { requestId: string; content: string }
  'ai:error': { requestId: string; error: string }

  // Knowledge events
  'knowledge:uploaded': void
  'knowledge:deleted': number
  'knowledge:tagged': { docId: number; tags: string[] }
  'knowledge:concept-selected': string

  // Settings events
  'settings:config-saved': number
  'settings:config-deleted': number

  // Generic events
  'error:occurred': { context: string; message: string }
  'app:ready': void
}

// ---------------------------------------------------------------------------
// Event bus implementation
// ---------------------------------------------------------------------------

type Listener<T> = (data: T) => void

class EventBus<Events> {
  private listeners = new Map<keyof Events, Set<Listener<unknown>>>()
  private static readonly MAX_LISTENERS_PER_EVENT = 50

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    if (set.size >= EventBus.MAX_LISTENERS_PER_EVENT) {
      console.warn(
        `[EventBus] Max listeners (${EventBus.MAX_LISTENERS_PER_EVENT}) reached for "${String(event)}". Possible memory leak.`,
      )
    }
    set.add(listener as Listener<unknown>)

    return () => {
      set!.delete(listener as Listener<unknown>)
      if (set!.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  /**
   * Subscribe to an event once. Auto-unsubscribes after the first call.
   */
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const unsub = this.on(event, (data) => {
      unsub()
      listener(data)
    })
    return unsub
  }

  /**
   * Emit an event. All registered listeners are called synchronously.
   */
  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const set = this.listeners.get(event)
    if (!set) return

    for (const listener of set) {
      try {
        ;(listener as Listener<Events[K]>)(data)
      } catch (error) {
        console.error(`[EventBus] Error in listener for "${String(event)}":`, error)
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all events if no key given.
   */
  off<K extends keyof Events>(event?: K): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  /**
   * Get the number of listeners for a given event.
   */
  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0
  }

  /**
   * Check if an event has any listeners.
   */
  hasListeners<K extends keyof Events>(event: K): boolean {
    return this.listenerCount(event) > 0
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const eventBus = new EventBus<AppEvents>()
