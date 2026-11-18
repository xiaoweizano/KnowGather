import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  validateAppSettingsPatch,
  type AppSettings,
  type AppSettingsPatch,
} from '../shared/settings.js'

interface SettingsFile {
  schemaVersion: 1
  settings: AppSettings
}

/**
 * Application-level settings (tray, auto launch, update feed, locale).
 *
 * Stored beside — never inside — the document database: the repository rebuilds
 * `shizhi-documents.json` from a fixed set of collections, so anything extra in
 * that file would be silently dropped on the next write.
 */
export class SettingsStore {
  private writeQueue: Promise<void> = Promise.resolve()
  private cached: AppSettings | null = null

  constructor(private readonly userDataDir: string) {}

  private get filePath(): string {
    return path.join(this.userDataDir, 'shizhi-settings.json')
  }

  get(): Promise<AppSettings> {
    return this.enqueue(async () => {
      if (this.cached) return { ...this.cached }
      this.cached = await this.read()
      return { ...this.cached }
    })
  }

  update(patch: AppSettingsPatch): Promise<AppSettings> {
    return this.enqueue(async () => {
      const validated = validateAppSettingsPatch(patch)
      const current = this.cached ?? await this.read()
      const next = normalizeAppSettings({ ...current, ...validated })
      this.cached = next
      await this.write(next)
      return { ...next }
    })
  }

  /** Bypasses the cache; used by tests and by `update` after an external edit. */
  async reload(): Promise<AppSettings> {
    this.cached = await this.read()
    return { ...this.cached }
  }

  private async read(): Promise<AppSettings> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_APP_SETTINGS }
      throw error
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SettingsFile>
      return normalizeAppSettings(parsed.settings)
    } catch {
      // A corrupt preferences file must not stop the app from starting.
      return { ...DEFAULT_APP_SETTINGS }
    }
  }

  private async write(settings: AppSettings): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true })
    const payload: SettingsFile = { schemaVersion: 1, settings }
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
