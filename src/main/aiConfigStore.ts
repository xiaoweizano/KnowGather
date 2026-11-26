import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_AI_CONFIG, normalizeAiConfig, type AiProviderConfig } from '../shared/ai.js'

interface AiConfigFile {
  schemaVersion: 1
  config: AiProviderConfig
}

/**
 * Stores the AI provider connection (endpoint, key, model, prompt).
 *
 * Kept in its own file rather than inside `shizhi-settings.json`: that file is
 * copied into diagnostics-friendly places and sent to `onSettingsChanged`
 * listeners, and an API key must not follow either path. Written with the same
 * atomic replace as the other stores so a crash cannot truncate the file.
 */
export class AiConfigStore {
  private writeQueue: Promise<void> = Promise.resolve()
  private cached: AiProviderConfig | null = null

  constructor(private readonly userDataDir: string) {}

  private get filePath(): string {
    return path.join(this.userDataDir, 'shizhi-ai.json')
  }

  get(): Promise<AiProviderConfig> {
    return this.enqueue(async () => {
      if (this.cached) return { ...this.cached }
      this.cached = await this.read()
      return { ...this.cached }
    })
  }

  save(config: AiProviderConfig): Promise<AiProviderConfig> {
    return this.enqueue(async () => {
      const next = normalizeAiConfig(config)
      this.cached = next
      await this.write(next)
      return { ...next }
    })
  }

  private async read(): Promise<AiProviderConfig> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_AI_CONFIG }
      throw error
    }
    try {
      const parsed = JSON.parse(raw) as Partial<AiConfigFile>
      return normalizeAiConfig(parsed.config)
    } catch {
      // A corrupt file must not stop the assistant from being reconfigured.
      return { ...DEFAULT_AI_CONFIG }
    }
  }

  private async write(config: AiProviderConfig): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true })
    const payload: AiConfigFile = { schemaVersion: 1, config }
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, JSON.stringify(payload, null, 2), 'utf8')
    await rename(temporaryPath, this.filePath)
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task)
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
