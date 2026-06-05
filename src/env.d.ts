interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

declare global {
  interface ImportMetaEnv {
    readonly DEV: boolean
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface Window {
    api: ElectronAPI
  }
}

export {}
