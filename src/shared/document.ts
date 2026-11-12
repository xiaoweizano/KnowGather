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
  tags: string[]
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
  tags: string[]
  content: TiptapDocument
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
  if (!isRecord(input) || input.type !== 'doc' || !Array.isArray(input.content)) {
    return cloneDocumentJson(EMPTY_DOCUMENT)
  }

  const content = input.content.filter(isTiptapNode)
  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  }
}

export function createDocumentRecord(input: {
  id: string
  title: string
  content: TiptapDocument
  tags?: string[]
  now?: string
}): DocumentRecord {
  const now = input.now ?? new Date().toISOString()
  return {
    id: input.id,
    title: input.title.trim() || '无标题文档',
    tags: input.tags ? [...input.tags] : [],
    content: normalizeDocumentJson(input.content),
    revision: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

export function isTiptapDocument(value: unknown): value is TiptapDocument {
  return isRecord(value) && value.type === 'doc' && Array.isArray(value.content)
}

function isTiptapNode(value: unknown): value is TiptapNode {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if ('text' in value && typeof value.text !== 'string') return false
  if ('content' in value && value.content !== undefined) {
    if (!Array.isArray(value.content)) return false
    return value.content.every(isTiptapNode)
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
