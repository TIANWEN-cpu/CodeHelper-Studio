import { describe, expect, it, vi } from 'vitest'
import { createSerialTaskQueue } from '../src/lib/serialTaskQueue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('serial task queue', () => {
  it('drains work appended while a previous task is still running', async () => {
    const first = deferred()
    const second = deferred()
    const calls: string[] = []
    const queue = createSerialTaskQueue()

    queue.enqueue(async () => {
      calls.push('first:start')
      await first.promise
      calls.push('first:end')
    })

    const draining = queue.drain()
    queue.enqueue(async () => {
      calls.push('second:start')
      await second.promise
      calls.push('second:end')
    })

    first.resolve()
    await vi.waitFor(() => {
      expect(calls).toEqual(['first:start', 'first:end', 'second:start'])
    })

    let drained = false
    draining.then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)

    second.resolve()
    await draining
    expect(calls).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('continues queued writes and reports the first failure after draining', async () => {
    const error = new Error('write failed')
    const afterFailure = vi.fn()
    const queue = createSerialTaskQueue()

    queue.enqueue(async () => {
      throw error
    })
    queue.enqueue(async () => {
      afterFailure()
    })

    await expect(queue.drain()).rejects.toBe(error)
    expect(afterFailure).toHaveBeenCalledOnce()
    await expect(queue.drain()).resolves.toBeUndefined()
  })

  it('reports the same batch failure to concurrent drain callers', async () => {
    const error = new Error('shared failure')
    const gate = deferred()
    const queue = createSerialTaskQueue()

    queue.enqueue(async () => {
      await gate.promise
      throw error
    })

    const firstDrain = queue.drain()
    const secondDrain = queue.drain()
    gate.resolve()

    const results = await Promise.allSettled([firstDrain, secondDrain])
    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ])
  })
})
