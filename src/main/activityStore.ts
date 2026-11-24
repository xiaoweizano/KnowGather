import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { localDayKey, type ActivityDay, type ActivityPayload } from '../shared/settings.js'

interface ActivityFile {
  schemaVersion: 1
  seeded: boolean
  days: Record<string, ActivityDay>
}

export interface ActivitySeedSource {
  createdAt: string
  updatedAt: string
}

const EMPTY_ACTIVITY = (): ActivityFile => ({ schemaVersion: 1, seeded: false, days: {} })

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// Imported history can span decades of daily notes, so the cap only guards
// against unbounded growth from a broken clock rather than trimming real days.
const MAX_TRACKED_DAYS = 7300

/**
 * Records daily editing activity for the home heatmap.
 *
 * Counts are written by the main process on successful saves so the renderer
 * cannot fabricate history. Kept in its own file: the document repository
 * rebuilds its JSON from a fixed collection list and would drop extra keys.
 */
export class ActivityStore {
  private writeQueue: Promise<void> = Promise.resolve()
  private cached: ActivityFile | null = null

  constructor(private readonly userDataDir: string) {}

  private get filePath(): string {
    return path.join(this.userDataDir, 'shizhi-activity.json')
  }

  /**
   * Adds one edit to today's bucket. `kind` distinguishes document edits from
   * journal entries so the heatmap can weight them differently later.
   */
  record(input: { kind: 'document' | 'journal'; characters?: number; now?: Date }): Promise<void> {
    return this.enqueue(async () => {
      const database = await this.load()
      const key = localDayKey(input.now ?? new Date())
      const day = database.days[key] ?? { edits: 0, journals: 0, characters: 0 }
      day.edits += 1
      if (input.kind === 'journal') day.journals += 1
      day.characters += Math.max(0, Math.floor(input.characters ?? 0))
      database.days[key] = day
      prune(database)
      await this.write(database)
    })
  }

  /**
   * Returns the recorded days. On the very first read the file does not exist,
   * so existing documents and journals are used to seed one edit per day they
   * were last touched — historical detail cannot be invented beyond that.
   */
  list(seedSources: readonly ActivitySeedSource[] = []): Promise<ActivityPayload> {
    return this.enqueue(async () => {
      const database = await this.load()
      if (!database.seeded) {
        seedFromRecords(database, seedSources)
        database.seeded = true
        // Persist the seed so it is not re-derived (and re-written) on every read.
        if (Object.keys(database.days).length > 0) await this.write(database)
      }
      return { days: cloneDays(database.days), seeded: database.seeded }
    })
  }

  private async load(): Promise<ActivityFile> {
    if (this.cached) return this.cached
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cached = EMPTY_ACTIVITY()
        return this.cached
      }
      throw error
    }
    this.cached = parseActivity(raw)
    return this.cached
  }

  private async write(database: ActivityFile): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, JSON.stringify(database, null, 2), 'utf8')
    await rename(temporaryPath, this.filePath)
    this.cached = database
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

function parseActivity(raw: string): ActivityFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_ACTIVITY()
  }
  if (!isRecord(parsed) || !isRecord(parsed.days)) return EMPTY_ACTIVITY()
  const days: Record<string, ActivityDay> = {}
  for (const [key, value] of Object.entries(parsed.days)) {
    if (!DAY_KEY_PATTERN.test(key) || !isRecord(value)) continue
    const edits = toCount(value.edits)
    const journals = toCount(value.journals)
    const characters = toCount(value.characters)
    if (edits === 0 && journals === 0 && characters === 0) continue
    days[key] = { edits, journals, characters }
  }
  return { schemaVersion: 1, seeded: parsed.seeded === true, days }
}

function seedFromRecords(database: ActivityFile, sources: readonly ActivitySeedSource[]): void {
  for (const source of sources) {
    const date = new Date(source.updatedAt || source.createdAt)
    if (Number.isNaN(date.getTime())) continue
    const key = localDayKey(date)
    const day = database.days[key] ?? { edits: 0, journals: 0, characters: 0 }
    // One seeded edit per record per day at most; real counts take precedence.
    if (day.edits === 0) day.edits = 1
    database.days[key] = day
  }
}

function prune(database: ActivityFile): void {
  const keys = Object.keys(database.days).sort()
  if (keys.length <= MAX_TRACKED_DAYS) return
  for (const key of keys.slice(0, keys.length - MAX_TRACKED_DAYS)) delete database.days[key]
}

function cloneDays(days: Record<string, ActivityDay>): Record<string, ActivityDay> {
  return Object.fromEntries(Object.entries(days).map(([key, value]) => [key, { ...value }]))
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
