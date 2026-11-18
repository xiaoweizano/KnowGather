export type TiptapMark = {
  type: string
  attrs?: Record<string, unknown>
}

export type TiptapNode = {
  type: string
  attrs?: Record<string, unknown> | null
  content?: TiptapNode[]
  marks?: TiptapMark[]
  text?: string
}

export type TiptapDocument = {
  type: 'doc'
  content: TiptapNode[]
}

export interface DocumentRecord {
  id: string
  title: string
  categoryId: string | null
  tags: string[]
  favorite: boolean
  content: TiptapDocument
  revision: number
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface DocumentSavePayload {
  id: string
  title: string
  categoryId: string | null
  tags: string[]
  favorite: boolean
  content: TiptapDocument
  revision: number
  version: number
}

export interface CategoryRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface CategorySavePayload {
  id?: string
  name: string
}

export interface JournalRecord {
  id: string
  title: string
  content: TiptapDocument
  categoryId: string | null
  revision: number
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface JournalSavePayload {
  id: string
  title: string
  content: TiptapDocument
  categoryId: string | null
  revision: number
  version: number
}

export interface SaveReceipt {
  revision: number
  version: number
  savedAt: string
}

export interface AttachmentReference {
  id: string
  name: string
  mimeType: string
  size: number
  url: `shizhi-attachment://${string}`
}

export const EMPTY_DOCUMENT: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

export function cloneDocumentJson(content: TiptapDocument): TiptapDocument {
  return JSON.parse(JSON.stringify(content)) as TiptapDocument
}

export function normalizeDocumentJson(input: unknown): TiptapDocument {
  if (!isTiptapDocument(input)) {
    throw new TypeError('Invalid Tiptap document JSON')
  }
  return cloneDocumentJson(input)
}

export function createDocumentRecord(input: {
  id: string
  title: string
  categoryId?: string | null
  content: TiptapDocument
  tags?: string[]
  favorite?: boolean
  now?: string
}): DocumentRecord {
  const now = input.now ?? new Date().toISOString()
  return {
    id: input.id,
    title: input.title.trim() || '无标题文档',
    categoryId: input.categoryId ?? null,
    tags: input.tags ? [...input.tags] : [],
    favorite: input.favorite ?? false,
    content: normalizeDocumentJson(input.content),
    revision: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

export function isTiptapDocument(value: unknown): value is TiptapDocument {
  if (!isRecord(value) || value.type !== 'doc' || !Array.isArray(value.content)) return false
  return value.content.every(isTiptapNode)
}

export function isTiptapNode(value: unknown): value is TiptapNode {
  if (!isRecord(value) || typeof value.type !== 'string' || value.type.trim().length === 0) return false
  if ('text' in value && value.text !== undefined && typeof value.text !== 'string') return false
  if ('attrs' in value && value.attrs !== undefined && value.attrs !== null && !isRecord(value.attrs)) return false
  if ('content' in value && value.content !== undefined) {
    if (!Array.isArray(value.content) || !value.content.every(isTiptapNode)) return false
  }
  if ('marks' in value && value.marks !== undefined) {
    if (!Array.isArray(value.marks) || !value.marks.every(isTiptapMark)) return false
  }
  return true
}

function isTiptapMark(value: unknown): value is TiptapMark {
  if (!isRecord(value) || typeof value.type !== 'string' || value.type.trim().length === 0) return false
  return !('attrs' in value) || value.attrs === undefined || isRecord(value.attrs)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
