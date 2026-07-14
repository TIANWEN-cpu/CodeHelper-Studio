import { Text } from '@codemirror/state'

export interface EditorCursorPosition {
  lineNumber: number
  column: number
}

export function normalizeEditorCursorPosition(value: unknown): EditorCursorPosition | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<EditorCursorPosition>
  if (!Number.isInteger(raw.lineNumber) || !Number.isInteger(raw.column)) return null
  return {
    lineNumber: Math.max(1, Number(raw.lineNumber)),
    column: Math.max(1, Number(raw.column)),
  }
}

export function cursorOffsetFromPosition(
  value: string,
  position: EditorCursorPosition | undefined,
): number {
  if (!position) return 0
  const document = Text.of(value.split(/\r\n?|\n/))
  const targetLine = Math.max(1, Math.floor(position.lineNumber))
  const targetColumn = Math.max(1, Math.floor(position.column))
  const line = document.line(Math.min(targetLine, document.lines))
  return Math.min(line.from + targetColumn - 1, line.to)
}

type RequestFrame = (callback: FrameRequestCallback) => number
type CancelFrame = (handle: number) => void

export class AnimationFrameReporter<T> {
  private frameHandle: number | null = null
  private hasPendingValue = false
  private pendingValue!: T

  constructor(
    private readonly report: (value: T) => void,
    private readonly requestFrame: RequestFrame = (callback) =>
      window.requestAnimationFrame(callback),
    private readonly cancelFrame: CancelFrame = (handle) => window.cancelAnimationFrame(handle),
  ) {}

  update(value: T): void {
    this.pendingValue = value
    this.hasPendingValue = true
    if (this.frameHandle !== null) return
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null
      this.flush()
    })
  }

  flush(): void {
    if (!this.hasPendingValue) return
    const value = this.pendingValue
    this.hasPendingValue = false
    this.report(value)
  }

  dispose(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle)
      this.frameHandle = null
    }
    this.flush()
  }
}
