import {
  cloneDocumentJson,
  isTiptapDocument,
  type CategorySavePayload,
  type DocumentSavePayload,
  type JournalSavePayload,
} from './document.js'

export function validateDocumentSavePayload(value: unknown): DocumentSavePayload {
  const candidate = expectRecord(value, 'document payload')
  return {
    id: expectNonEmptyString(candidate.id, 'id'),
    title: expectString(candidate.title, 'title'),
    categoryId: expectNullableId(candidate.categoryId, 'categoryId'),
    tags: expectStringArray(candidate.tags, 'tags'),
    content: validateContent(candidate.content),
    revision: expectNonNegativeInteger(candidate.revision, 'revision'),
    version: expectNonNegativeInteger(candidate.version, 'version'),
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
  return {
    id: expectNonEmptyString(candidate.id, 'id'),
    title: expectString(candidate.title, 'title'),
    categoryId: expectNullableId(candidate.categoryId, 'categoryId'),
    content: validateContent(candidate.content),
    revision: expectNonNegativeInteger(candidate.revision, 'revision'),
    version: expectNonNegativeInteger(candidate.version, 'version'),
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

function expectNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`)
  }
  return value
}
