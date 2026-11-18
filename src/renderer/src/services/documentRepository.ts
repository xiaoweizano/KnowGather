import type {
  CategoryRecord,
  CategorySavePayload,
  DocumentRecord,
  DocumentSavePayload,
  JournalRecord,
  JournalSavePayload,
  SaveReceipt,
} from '../../../shared/document'

export interface DocumentRepository {
  list(): Promise<DocumentRecord[]>
  get(id: string): Promise<DocumentRecord | null>
  save(payload: DocumentSavePayload): Promise<SaveReceipt>
  remove(id: string): Promise<void>
}

export interface KnowledgeRepository extends DocumentRepository {
  listCategories(): Promise<CategoryRecord[]>
  saveCategory(payload: CategorySavePayload): Promise<CategoryRecord>
  removeCategory(id: string): Promise<void>
  listJournals(): Promise<JournalRecord[]>
  getJournal(id: string): Promise<JournalRecord | null>
  saveJournal(payload: JournalSavePayload): Promise<SaveReceipt>
  removeJournal(id: string): Promise<void>
}

interface KnowledgeDatabaseV1 {
  schemaVersion: 1
  documents: Record<string, LegacyDocumentRecord>
}

interface LegacyDocumentRecord extends Omit<DocumentRecord, 'categoryId'> {
  categoryId?: string | null
}

interface KnowledgeDatabaseV2 {
  schemaVersion: 2
  documents: Record<string, DocumentRecord>
  categories: Record<string, CategoryRecord>
  journalEntries: Record<string, JournalRecord>
}

const STORAGE_KEY = 'shizhi.knowledge.v2'
const LEGACY_STORAGE_KEY = 'shizhi.documents.v1'

const EMPTY_DATABASE = (): KnowledgeDatabaseV2 => ({
  schemaVersion: 2,
  documents: {},
  categories: {},
  journalEntries: {},
})

export class BrowserDocumentRepository implements KnowledgeRepository {
  constructor(private readonly storage: Storage = window.localStorage) {}

  async list(): Promise<DocumentRecord[]> {
    return activeRecords(this.readDatabase().documents).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(id: string): Promise<DocumentRecord | null> {
    const record = this.readDatabase().documents[id]
    return record?.deletedAt === null ? clone(record) : null
  }

  async save(payload: DocumentSavePayload): Promise<SaveReceipt> {
    const database = this.readDatabase()
    const current = database.documents[payload.id]
    if (current?.deletedAt === null && current.revision > payload.revision) {
      return { revision: current.revision, version: current.version, savedAt: current.updatedAt }
    }
    const now = new Date().toISOString()
    const record: DocumentRecord = {
      id: payload.id,
      title: payload.title.trim() || '无标题文档',
      categoryId: payload.categoryId,
      tags: [...payload.tags],
      favorite: payload.favorite,
      content: clone(payload.content),
      revision: payload.revision,
      version: Math.max(payload.version, (current?.version ?? 0) + 1),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    }
    database.documents[record.id] = record
    this.writeDatabase(database)
    return { revision: record.revision, version: record.version, savedAt: now }
  }

  async remove(id: string): Promise<void> {
    const database = this.readDatabase()
    const current = database.documents[id]
    if (!current || current.deletedAt !== null) return
    const now = new Date().toISOString()
    database.documents[id] = {
      ...current,
      version: current.version + 1,
      updatedAt: now,
      deletedAt: now,
    }
    this.writeDatabase(database)
  }

  async listCategories(): Promise<CategoryRecord[]> {
    return activeRecords(this.readDatabase().categories).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async saveCategory(payload: CategorySavePayload): Promise<CategoryRecord> {
    const name = payload.name.trim()
    if (!name) throw new TypeError('Category name must not be empty')
    if (name.length > 80) throw new TypeError('Category name must not exceed 80 characters')
    const database = this.readDatabase()
    const id = payload.id ?? crypto.randomUUID()
    const current = database.categories[id]
    const now = new Date().toISOString()
    const record: CategoryRecord = {
      id,
      name,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    }
    database.categories[id] = record
    this.writeDatabase(database)
    return clone(record)
  }

  async removeCategory(id: string): Promise<void> {
    const database = this.readDatabase()
    const current = database.categories[id]
    if (!current || current.deletedAt !== null) return
    const now = new Date().toISOString()
    database.categories[id] = { ...current, updatedAt: now, deletedAt: now }
    for (const document of Object.values(database.documents)) {
      if (document.categoryId === id && document.deletedAt === null) {
        document.categoryId = null
        document.version += 1
        document.updatedAt = now
      }
    }
    for (const journal of Object.values(database.journalEntries)) {
      if (journal.categoryId === id && journal.deletedAt === null) {
        journal.categoryId = null
        journal.version += 1
        journal.updatedAt = now
      }
    }
    this.writeDatabase(database)
  }

  async listJournals(): Promise<JournalRecord[]> {
    return activeRecords(this.readDatabase().journalEntries).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async getJournal(id: string): Promise<JournalRecord | null> {
    const record = this.readDatabase().journalEntries[id]
    return record?.deletedAt === null ? clone(record) : null
  }

  async saveJournal(payload: JournalSavePayload): Promise<SaveReceipt> {
    const database = this.readDatabase()
    const current = database.journalEntries[payload.id]
    if (current?.deletedAt === null && current.revision > payload.revision) {
      return { revision: current.revision, version: current.version, savedAt: current.updatedAt }
    }
    const now = new Date().toISOString()
    const record: JournalRecord = {
      id: payload.id,
      title: payload.title.trim() || '无标题日志',
      content: clone(payload.content),
      categoryId: payload.categoryId,
      revision: payload.revision,
      version: Math.max(payload.version, (current?.version ?? 0) + 1),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    }
    database.journalEntries[record.id] = record
    this.writeDatabase(database)
    return { revision: record.revision, version: record.version, savedAt: now }
  }

  async removeJournal(id: string): Promise<void> {
    const database = this.readDatabase()
    const current = database.journalEntries[id]
    if (!current || current.deletedAt !== null) return
    const now = new Date().toISOString()
    database.journalEntries[id] = {
      ...current,
      version: current.version + 1,
      updatedAt: now,
      deletedAt: now,
    }
    this.writeDatabase(database)
  }

  private readDatabase(): KnowledgeDatabaseV2 {
    const raw = this.storage.getItem(STORAGE_KEY)
    if (!raw) return this.readLegacyDatabase()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Invalid knowledge database JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!isRecord(parsed) || parsed.schemaVersion !== 2) {
      throw new Error('Invalid or unsupported knowledge database')
    }
    if (!isRecord(parsed.documents) || !isRecord(parsed.categories) || !isRecord(parsed.journalEntries)) {
      throw new Error('Invalid knowledge database collections')
    }
    return parsed as unknown as KnowledgeDatabaseV2
  }

  private readLegacyDatabase(): KnowledgeDatabaseV2 {
    const raw = this.storage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return EMPTY_DATABASE()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Invalid legacy document database JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!Array.isArray(parsed)) throw new Error('Invalid legacy document database')
    const database = EMPTY_DATABASE()
    for (const value of parsed) {
      if (!isDocumentRecord(value)) continue
      database.documents[value.id] = { ...value, categoryId: value.categoryId ?? null }
    }
    this.writeDatabase(database)
    return database
  }

  private writeDatabase(database: KnowledgeDatabaseV2): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(database))
  }
}

function activeRecords<T extends { id: string; deletedAt: string | null }>(records: Record<string, T>): T[] {
  return Object.values(records).filter((record) => record.deletedAt === null).map(clone)
}

function isDocumentRecord(value: unknown): value is DocumentRecord {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && typeof value.title === 'string' && Array.isArray(value.tags)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
