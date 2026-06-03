export async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.api.invoke(channel, ...args) as Promise<T>
}

export function onEvent(channel: string, callback: (...args: unknown[]) => void): () => void {
  return window.api.on(channel, callback)
}
