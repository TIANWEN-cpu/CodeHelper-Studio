/**
 * Type-safe IPC invoke wrapper.
 *
 * Replaces `(await window.api.invoke(channel, ...args)) as SomeType`
 * with `await typedInvoke(channel, ...args)` which is fully type-safe.
 *
 * Usage:
 * ```ts
 * import { typedInvoke, typedOn } from '../api/ipc'
 *
 * // Invoke with type inference
 * const problems = await typedInvoke('problems-list', { difficulty: 'easy' })
 * // problems is typed as Problem[]
 *
 * // Listen to events with type inference
 * const unsub = typedOn('ai-chat-chunk', (payload) => {
 *   // payload is typed as StreamChunkPayload
 * })
 * ```
 */

import type { IpcChannelMap, IpcEventMap } from '../types/ipc'

/**
 * Type-safe wrapper around `window.api.invoke`.
 *
 * Infers argument types and return type from the channel name.
 */
export async function typedInvoke<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: IpcChannelMap[K]['args']
): Promise<IpcChannelMap[K]['result']> {
  return window.api.invoke(channel, ...args) as Promise<IpcChannelMap[K]['result']>
}

/**
 * Type-safe wrapper around `window.api.on`.
 *
 * Infers the callback payload type from the event channel name.
 */
export function typedOn<K extends keyof IpcEventMap>(
  channel: K,
  callback: (payload: IpcEventMap[K]) => void,
): () => void {
  return window.api.on(channel, (payload: unknown) => {
    callback(payload as IpcEventMap[K])
  })
}
