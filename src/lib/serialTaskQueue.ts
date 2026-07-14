export interface SerialTaskQueue {
  enqueue(task: () => Promise<void>): Promise<void>
  drain(): Promise<void>
}

export function createSerialTaskQueue(): SerialTaskQueue {
  let tail = Promise.resolve()
  let version = 0
  let firstError: unknown = null
  let activeDrain: Promise<void> | null = null

  return {
    enqueue(task) {
      version++
      tail = tail.then(task).catch((error) => {
        if (firstError === null) firstError = error
      })
      return tail
    },

    drain() {
      if (activeDrain) return activeDrain

      const running = (async () => {
        while (true) {
          const observedVersion = version
          const observedTail = tail
          await observedTail
          if (observedVersion === version && observedTail === tail) break
        }

        const error = firstError
        firstError = null
        if (error !== null) throw error
      })().finally(() => {
        if (activeDrain === running) activeDrain = null
      })
      activeDrain = running
      return running
    },
  }
}
