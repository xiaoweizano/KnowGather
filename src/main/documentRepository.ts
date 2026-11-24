import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  CategoryRecord,
  CategorySavePayload,
  DocumentRecord,
  DocumentSavePayload,
  JournalRecord,
  JournalSavePayload,
  SaveReceipt,
  TiptapDocument,
} from '../shared/document.js'
import {
  validateCategorySavePayload,
  validateDocumentSavePayload,
  validateJournalSavePayload,
} from '../shared/validation.js'

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

const EMPTY_DATABASE = (): KnowledgeDatabaseV2 => ({
  schemaVersion: 2,
  documents: {},
  categories: {},
  journalEntries: {},
})

/**
 * A backdated import may not point at the future. Such a value is ignored
 * rather than rejected: a wrong system clock should not block the save.
 */
function isPastTimestamp(value: string | undefined, now: string): value is string {
  if (!value) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && time <= Date.parse(now)
}

export class AtomicDocumentRepository {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly userDataDir: string) {}

  private get databasePath(): string {
    return path.join(this.userDataDir, 'shizhi-documents.json')
  }

  list(): Promise<DocumentRecord[]> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      return Object.values(database.documents)
        .filter((document) => document.deletedAt === null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })
  }

  get(id: string): Promise<DocumentRecord | null> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      const document = database.documents[id]
      return document && document.deletedAt === null ? document : null
    })
  }

  save(payload: DocumentSavePayload): Promise<SaveReceipt> {
    return this.enqueue(async () => {
      const validated = validateDocumentSavePayload(payload)
      const database = await this.readDatabase()
      const current = database.documents[validated.id]
      // A tombstoned record never accepts a save.
      if (current && current.deletedAt !== null) {
        return {
          revision: current.revision,
          version: current.version,
          savedAt: current.updatedAt,
          created: false,
        }
      }
      if (current && current.revision > validated.revision) {
        return {
          revision: current.revision,
          version: current.version,
          savedAt: current.updatedAt,
          created: false,
        }
      }

      const now = new Date().toISOString()
      // A backdated timestamp only applies when the record is first created;
      // later edits always move updatedAt to the present.
      const backdated = !current && isPastTimestamp(validated.createdAt, now) ? validated.createdAt : null
      const createdAt = current?.createdAt ?? backdated ?? now
      const updatedAt = backdated ?? now
      const record: DocumentRecord = {
        id: validated.id,
        title: validated.title.trim() || '无标题文档',
        categoryId: validated.categoryId,
        tags: [...validated.tags],
        favorite: validated.favorite,
        content: validated.content,
        revision: validated.revision,
        version: Math.max(validated.version, (current?.version ?? 0) + 1),
        createdAt,
        updatedAt,
        deletedAt: null,
        sourceJournalId: validated.sourceJournalId ?? current?.sourceJournalId ?? null,
      }
      database.documents[record.id] = record
      await this.writeDatabase(database)
      return { revision: record.revision, version: record.version, savedAt: updatedAt, created: !current }
    })
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      const current = database.documents[id]
      if (!current || current.deletedAt !== null) return
      const now = new Date().toISOString()
      database.documents[id] = {
        ...current,
        version: current.version + 1,
        updatedAt: now,
        deletedAt: now,
      }
      await this.writeDatabase(database)
    })
  }

  listCategories(): Promise<CategoryRecord[]> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      return Object.values(database.categories)
        .filter((category) => category.deletedAt === null)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    })
  }

  saveCategory(payload: CategorySavePayload): Promise<CategoryRecord> {
    return this.enqueue(async () => {
      const validated = validateCategorySavePayload(payload)
      const database = await this.readDatabase()
      const id = validated.id ?? randomUUID()
      const current = database.categories[id]
      const now = new Date().toISOString()
      const record: CategoryRecord = {
        id,
        name: validated.name,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      }
      database.categories[id] = record
      await this.writeDatabase(database)
      return record
    })
  }

  removeCategory(id: string): Promise<void> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      const current = database.categories[id]
      if (!current || current.deletedAt !== null) return
      const now = new Date().toISOString()
      database.categories[id] = { ...current, updatedAt: now, deletedAt: now }
      for (const [documentId, document] of Object.entries(database.documents)) {
        if (document.categoryId === id && document.deletedAt === null) {
          database.documents[documentId] = {
            ...document,
            categoryId: null,
            version: document.version + 1,
            updatedAt: now,
          }
        }
      }
      for (const [journalId, journal] of Object.entries(database.journalEntries)) {
        if (journal.categoryId === id && journal.deletedAt === null) {
          database.journalEntries[journalId] = {
            ...journal,
            categoryId: null,
            version: journal.version + 1,
            updatedAt: now,
          }
        }
      }
      await this.writeDatabase(database)
    })
  }

  listJournals(): Promise<JournalRecord[]> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      return Object.values(database.journalEntries)
        .filter((journal) => journal.deletedAt === null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })
  }

  getJournal(id: string): Promise<JournalRecord | null> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      const journal = database.journalEntries[id]
      return journal && journal.deletedAt === null ? journal : null
    })
  }

  saveJournal(payload: JournalSavePayload): Promise<SaveReceipt> {
    return this.enqueue(async () => {
      const validated = validateJournalSavePayload(payload)
      const database = await this.readDatabase()
      const current = database.journalEntries[validated.id]
      // A tombstoned entry never accepts a save: an autosave armed before the
      // delete must not resurrect it.
      if (current && current.deletedAt !== null) {
        return {
          revision: current.revision,
          version: current.version,
          savedAt: current.updatedAt,
          created: false,
        }
      }
      if (current && current.revision > validated.revision) {
        return {
          revision: current.revision,
          version: current.version,
          savedAt: current.updatedAt,
          created: false,
        }
      }

      const now = new Date().toISOString()
      // Same rule as documents: an imported entry keeps the day it was written
      // on when it is first saved, and later edits move to the present.
      const backdated = !current && isPastTimestamp(validated.createdAt, now) ? validated.createdAt : null
      const record: JournalRecord = {
        id: validated.id,
        title: validated.title.trim() || '无标题日志',
        content: validated.content,
        categoryId: validated.categoryId,
        revision: validated.revision,
        version: Math.max(validated.version, (current?.version ?? 0) + 1),
        createdAt: current?.createdAt ?? backdated ?? now,
        updatedAt: backdated ?? now,
        deletedAt: null,
        documentId: validated.documentId ?? current?.documentId ?? null,
      }
      database.journalEntries[record.id] = record
      await this.writeDatabase(database)
      return { revision: record.revision, version: record.version, savedAt: record.updatedAt, created: !current }
    })
  }

  removeJournal(id: string): Promise<void> {
    return this.enqueue(async () => {
      const database = await this.readDatabase()
      const current = database.journalEntries[id]
      if (!current || current.deletedAt !== null) return
      const now = new Date().toISOString()
      database.journalEntries[id] = {
        ...current,
        version: current.version + 1,
        updatedAt: now,
        deletedAt: now,
      }
      await this.writeDatabase(database)
    })
  }

  private async readDatabase(): Promise<KnowledgeDatabaseV2> {
    let raw: string
    try {
      raw = await readFile(this.databasePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_DATABASE()
      throw error
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Invalid shizhi document database JSON')
    }
    if (!isRecord(parsed)) throw new Error('Invalid shizhi document database')

    if (parsed.schemaVersion === 1) {
      const migrated = migrateV1Database(parsed)
      await this.writeDatabase(migrated)
      return migrated
    }
    if (parsed.schemaVersion !== 2) {
      throw new Error(`Unsupported shizhi database schema: ${String(parsed.schemaVersion)}`)
    }
    return validateV2Database(parsed)
  }

  private async writeDatabase(database: KnowledgeDatabaseV2): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true })
    const temporaryPath = `${this.databasePath}.${process.pid}.${randomUUID()}.tmp`
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

function migrateV1Database(value: Record<string, unknown>): KnowledgeDatabaseV2 {
  if (!isRecord(value.documents)) throw new Error('Invalid legacy document database')
  const database = EMPTY_DATABASE()
  for (const [key, rawRecord] of Object.entries(value.documents)) {
    const document = validatePersistedDocument(rawRecord, true)
    if (document.id !== key) throw new Error('Invalid legacy document record: id mismatch')
    database.documents[key] = document
  }
  return database
}

function validateV2Database(value: Record<string, unknown>): KnowledgeDatabaseV2 {
  if (!isRecord(value.documents)) throw new Error('Invalid document database: documents')
  if (!isRecord(value.categories)) throw new Error('Invalid document database: categories')
  if (!isRecord(value.journalEntries)) throw new Error('Invalid document database: journalEntries')
  const database = EMPTY_DATABASE()
  for (const collection of ['documents', 'categories', 'journalEntries'] as const) {
    const collectionValue = value[collection]
    if (!isRecord(collectionValue)) throw new Error(`Invalid document database: ${collection}`)
    for (const [key, rawRecord] of Object.entries(collectionValue)) {
      if (collection === 'documents') {
        const record = validatePersistedDocument(rawRecord, false)
        if (record.id !== key) throw new Error('Invalid document record: id mismatch')
        database.documents[key] = record
      } else if (collection === 'categories') {
        const record = validatePersistedCategory(rawRecord)
        if (record.id !== key) throw new Error('Invalid category record: id mismatch')
        database.categories[key] = record
      } else {
        const record = validatePersistedJournal(rawRecord)
        if (record.id !== key) throw new Error('Invalid journalEntry record: id mismatch')
        database.journalEntries[key] = record
      }
    }
  }
  return database
}

function validatePersistedDocument(value: unknown, legacy: boolean): DocumentRecord {
  if (!isRecord(value)) throw new Error('Invalid document record')
  const categoryId = legacy ? (value.categoryId ?? null) : value.categoryId
  // Older v1 databases and documents saved before the favorite field existed
  // simply carry no value; treat a missing flag as "not favorited".
  const favorite = value.favorite ?? false
  try {
    const payload = validateDocumentSavePayload({
      id: value.id,
      title: value.title,
      categoryId,
      tags: value.tags,
      favorite,
      content: value.content,
      revision: value.revision,
      version: value.version,
      ...(value.sourceJournalId === undefined || value.sourceJournalId === null
        ? {}
        : { sourceJournalId: value.sourceJournalId }),
    })
    return {
      ...payload,
      sourceJournalId: payload.sourceJournalId ?? null,
      createdAt: expectTimestamp(value.createdAt, 'document createdAt'),
      updatedAt: expectTimestamp(value.updatedAt, 'document updatedAt'),
      deletedAt: value.deletedAt === null ? null : expectTimestamp(value.deletedAt, 'document deletedAt'),
    }
  } catch (error) {
    throw new Error(`Invalid document record: ${message(error)}`)
  }
}

function validatePersistedCategory(value: unknown): CategoryRecord {
  if (!isRecord(value)) throw new Error('Invalid category record')
  try {
    const payload = validateCategorySavePayload({ id: value.id, name: value.name })
    return {
      id: payload.id!,
      name: payload.name,
      createdAt: expectTimestamp(value.createdAt, 'category createdAt'),
      updatedAt: expectTimestamp(value.updatedAt, 'category updatedAt'),
      deletedAt: value.deletedAt === null ? null : expectTimestamp(value.deletedAt, 'category deletedAt'),
    }
  } catch (error) {
    throw new Error(`Invalid category record: ${message(error)}`)
  }
}

function validatePersistedJournal(value: unknown): JournalRecord {
  if (!isRecord(value)) throw new Error('Invalid journalEntry record')
  try {
    const payload = validateJournalSavePayload({
      id: value.id,
      title: value.title,
      categoryId: value.categoryId,
      content: value.content,
      revision: value.revision,
      version: value.version,
      ...(value.documentId === undefined || value.documentId === null
        ? {}
        : { documentId: value.documentId }),
    })
    return {
      ...payload,
      documentId: payload.documentId ?? null,
      createdAt: expectTimestamp(value.createdAt, 'journalEntry createdAt'),
      updatedAt: expectTimestamp(value.updatedAt, 'journalEntry updatedAt'),
      deletedAt: value.deletedAt === null ? null : expectTimestamp(value.deletedAt, 'journalEntry deletedAt'),
    }
  } catch (error) {
    throw new Error(`Invalid journalEntry record: ${message(error)}`)
  }
}

function expectTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be an ISO timestamp`)
  }
  return value
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type { TiptapDocument }
