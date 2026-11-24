import {
  cloneDocumentJson,
  isTiptapDocument,
  type CategorySavePayload,
  type DocumentSavePayload,
  type JournalSavePayload,
} from './document.js'

export function validateDocumentSavePayload(value: unknown): DocumentSavePayload {
  const candidate = expectRecord(value, 'document payload')
  const createdAt = expectOptionalTimestamp(candidate.createdAt, 'createdAt')
  return {
    id: expectNonEmptyString(candidate.id, 'id'),
    title: expectString(candidate.title, 'title'),
    categoryId: expectNullableId(candidate.categoryId, 'categoryId'),
    tags: expectStringArray(candidate.tags, 'tags'),
    favorite: expectOptionalBoolean(candidate.favorite, 'favorite'),
    content: validateContent(candidate.content),
    revision: expectNonNegativeInteger(candidate.revision, 'revision'),
    version: expectNonNegativeInteger(candidate.version, 'version'),
    ...(createdAt ? { createdAt } : {}),
    ...(candidate.sourceJournalId === undefined
      ? {}
      : { sourceJournalId: expectNullableId(candidate.sourceJournalId, 'sourceJournalId') }),
  }
}

export function validateCategorySavePayload(value: unknown): CategorySavePayload {
  const candidate = expectRecord(value, 'category payload')
  const name = expectString(candidate.name, 'name').trim()
  if (name.length === 0) throw new TypeError('Category name must not be empty')
  if (name.length > 80) throw new TypeError('Category name must not exceed 80 characters')
  return {
    ...(candidate.id === undefined ? {} : { id: expectNonEmptyString(candidate.id, 'id') }),
    name,
  }
}

export function validateJournalSavePayload(value: unknown): JournalSavePayload {
  const candidate = expectRecord(value, 'journal payload')
  const createdAt = expectOptionalTimestamp(candidate.createdAt, 'createdAt')
  return {
    id: expectNonEmptyString(candidate.id, 'id'),
    title: expectString(candidate.title, 'title'),
    categoryId: expectNullableId(candidate.categoryId, 'categoryId'),
    content: validateContent(candidate.content),
    revision: expectNonNegativeInteger(candidate.revision, 'revision'),
    version: expectNonNegativeInteger(candidate.version, 'version'),
    ...(createdAt ? { createdAt } : {}),
    ...(candidate.documentId === undefined
      ? {}
      : { documentId: expectNullableId(candidate.documentId, 'documentId') }),
  }
}

function validateContent(value: unknown): DocumentSavePayload['content'] {
  if (!isTiptapDocument(value)) throw new TypeError('Invalid Tiptap content')
  return cloneDocumentJson(value)
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Invalid ${label}`)
  }
  return value as Record<string, unknown>
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`)
  return value
}

function expectNonEmptyString(value: unknown, field: string): string {
  const text = expectString(value, field)
  if (text.length === 0) throw new TypeError(`${field} must not be empty`)
  return text
}

function expectNullableId(value: unknown, field: string): string | null {
  if (value === null) return null
  return expectNonEmptyString(value, field)
}

function expectStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new TypeError(`${field} must be an array of strings`)
  }
  return [...value]
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be a boolean`)
  return value
}

// Documents persisted before the favorite flag existed carry no value. Missing
// is treated as false so old databases keep loading; a wrong type still fails.
function expectOptionalBoolean(value: unknown, field: string): boolean {
  if (value === undefined) return false
  return expectBoolean(value, field)
}

/** Optional ISO timestamp; a value that cannot be parsed is a programming error. */
function expectOptionalTimestamp(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be an ISO timestamp`)
  }
  return value
}

function expectNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`)
  }
  return value
}
