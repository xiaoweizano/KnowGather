import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DocumentRecord, DocumentSavePayload, SaveReceipt } from '../shared/document.js'

interface DocumentDatabase {
  schemaVersion: 1
  documents: Record<string, DocumentRecord>
}

const EMPTY_DATABASE: DocumentDatabase = { schemaVersion: 1, documents: {} }

export class AtomicDocumentRepository {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly userDataDir: string) {}

  private get databasePath(): string {
    return path.join(this.userDataDir, 'shizhi-documents.json')
  }

  async list(): Promise<DocumentRecord[]> {
    const database = await this.readDatabase()
    return Object.values(database.documents)
      .filter((document) => document.deletedAt === null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(id: string): Promise<DocumentRecord | null> {
    const database = await this.readDatabase()
    const document = database.documents[id]
    return document && document.deletedAt === null ? document : null
  }

  async save(payload: DocumentSavePayload): Promise<SaveReceipt> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      const current = database.documents[payload.id]
      if (current && current.revision > payload.revision) {
        return {
          revision: current.revision,
          version: current.version,
          savedAt: current.updatedAt,
        }
      }

      const now = new Date().toISOString()
      const record: DocumentRecord = {
        id: payload.id,
        title: payload.title.trim() || '无标题文档',
        tags: [...payload.tags],
        content: payload.content,
        revision: payload.revision,
        version: Math.max(payload.version, (current?.version ?? 0) + 1),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      }
      database.documents[payload.id] = record
      await this.writeDatabase(database)
      return { revision: record.revision, version: record.version, savedAt: now }
    })
  }

  async remove(id: string): Promise<void> {
    await this.enqueue(async () => {
      const database = await this.readDatabase()
      const current = database.documents[id]
      if (!current) return
      database.documents[id] = { ...current, deletedAt: new Date().toISOString() }
      await this.writeDatabase(database)
    })
  }

  private async readDatabase(): Promise<DocumentDatabase> {
    try {
      const raw = await readFile(this.databasePath, 'utf8')
      const parsed = JSON.parse(raw) as DocumentDatabase
      if (parsed.schemaVersion !== 1 || typeof parsed.documents !== 'object') {
        return structuredClone(EMPTY_DATABASE)
      }
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY_DATABASE)
      throw error
    }
  }

  private async writeDatabase(database: DocumentDatabase): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true })
    const temporaryPath = `${this.databasePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, JSON.stringify(database, null, 2), 'utf8')
    await rename(temporaryPath, this.databasePath)
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
