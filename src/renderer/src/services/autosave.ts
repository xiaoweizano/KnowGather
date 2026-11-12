import type { DocumentSavePayload, SaveReceipt } from '../../../shared/document'

export type SavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface AutoSaveState {
  phase: SavePhase
  revision: number
  savedRevision: number
  error: string | null
  lastSavedAt: string | null
}

export interface AutoSaveOptions {
  delay?: number
  save: (payload: DocumentSavePayload) => Promise<SaveReceipt>
  onStateChange?: (state: AutoSaveState) => void
}

export class AutoSaveController {
  private readonly delay: number
  private readonly save: AutoSaveOptions['save']
  private readonly onStateChange?: AutoSaveOptions['onStateChange']
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: DocumentSavePayload | null = null
  private inFlight: Promise<boolean> | null = null
  private state: AutoSaveState = {
    phase: 'idle',
    revision: 0,
    savedRevision: 0,
    error: null,
    lastSavedAt: null,
  }

  constructor(options: AutoSaveOptions) {
    this.delay = options.delay ?? 800
    this.save = options.save
    this.onStateChange = options.onStateChange
  }

  get snapshot(): Readonly<AutoSaveState> {
    return { ...this.state }
  }

  schedule(payload: DocumentSavePayload): void {
    this.pending = payload
    this.setState({
      phase: 'dirty',
      revision: payload.revision,
      error: null,
    })
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.delay)
  }

  async flush(): Promise<boolean> {
    this.clearTimer()
    if (this.inFlight) {
      await this.inFlight
      if (!this.pending) return this.state.phase === 'saved'
    }

    if (!this.pending) return this.state.phase === 'saved'

    const payload = this.pending
    this.pending = null
    this.setState({ phase: 'saving', revision: payload.revision, error: null })

    this.inFlight = (async () => {
      try {
        const receipt = await this.save(payload)
        this.setState({
          phase: this.pending ? 'dirty' : 'saved',
          savedRevision: receipt.revision,
          lastSavedAt: receipt.savedAt,
          error: null,
        })
        return true
      } catch (error) {
        this.pending ??= payload
        this.setState({
          phase: 'error',
          revision: payload.revision,
          error: error instanceof Error ? error.message : '保存失败，请重试',
        })
        return false
      } finally {
        this.inFlight = null
      }
    })()

    const succeeded = await this.inFlight
    if (succeeded && this.pending) {
      return this.flush()
    }
    return succeeded
  }

  retry(): Promise<boolean> {
    return this.flush()
  }

  dispose(): void {
    this.clearTimer()
    this.inFlight = null
    this.pending = null
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private setState(patch: Partial<AutoSaveState>): void {
    this.state = { ...this.state, ...patch }
    this.onStateChange?.(this.snapshot)
  }
}
