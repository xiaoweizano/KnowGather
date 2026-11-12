import type { DocumentRecord, DocumentSavePayload, SaveReceipt } from '../../../shared/document'

export interface DocumentRepository {
  list(): Promise<DocumentRecord[]>
  get(id: string): Promise<DocumentRecord | null>
  save(payload: DocumentSavePayload): Promise<SaveReceipt>
  remove(id: string): Promise<void>
}

const STORAGE_KEY = 'shizhi.documents.v1'

export class BrowserDocumentRepository implements DocumentRepository {
  constructor(private readonly storage: Storage = window.localStorage) {}

  async list(): Promise<DocumentRecord[]> {
    return this.readAll().filter((document) => !document.deletedAt)
  }

  async get(id: string): Promise<DocumentRecord | null> {
    return this.readAll().find((document) => document.id === id && !document.deletedAt) ?? null
  }

  async save(payload: DocumentSavePayload): Promise<SaveReceipt> {
    const documents = this.readAll()
    const index = documents.findIndex((document) => document.id === payload.id)
    const now = new Date().toISOString()
    const current = index >= 0 ? documents[index] : undefined
    const next: DocumentRecord = {
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
    if (index >= 0) documents[index] = next
    else documents.push(next)
    this.storage.setItem(STORAGE_KEY, JSON.stringify(documents))
    return { revision: payload.revision, version: next.version, savedAt: now }
  }

  async remove(id: string): Promise<void> {
    const documents = this.readAll()
    const index = documents.findIndex((document) => document.id === id)
    if (index < 0) return
    documents[index] = { ...documents[index]!, deletedAt: new Date().toISOString() }
    this.storage.setItem(STORAGE_KEY, JSON.stringify(documents))
  }

  private readAll(): DocumentRecord[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isDocumentRecord) : []
    } catch {
      return []
    }
  }
}

function isDocumentRecord(value: unknown): value is DocumentRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<DocumentRecord>
  return typeof candidate.id === 'string' && typeof candidate.title === 'string'
}
