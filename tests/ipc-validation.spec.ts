import { describe, expect, it } from 'vitest'
import {
  validateCategorySavePayload,
  validateDocumentSavePayload,
  validateJournalSavePayload,
} from '../src/shared/validation'

const content = { type: 'doc' as const, content: [{ type: 'paragraph' }] }

describe('IPC business payload validation', () => {
  it('accepts valid document, category and journal payloads', () => {
    const document = validateDocumentSavePayload({
      id: 'doc-1', title: '标题', categoryId: null, tags: ['标签'], content, revision: 0, version: 1,
    })
    expect(document.tags).toEqual(['标签'])
    expect(validateCategorySavePayload({ name: '工作' }).name).toBe('工作')
    expect(validateJournalSavePayload({
      id: 'journal-1', title: '日志', categoryId: null, content, revision: 0, version: 1,
    }).title).toBe('日志')
  })

  it('rejects malformed tags, invalid counters and malformed Tiptap content', () => {
    expect(() => validateDocumentSavePayload({
      id: 'doc-1', title: '标题', categoryId: null, tags: ['ok', 3], content, revision: 0, version: 1,
    })).toThrow()
    expect(() => validateDocumentSavePayload({
      id: 'doc-1', title: '标题', categoryId: null, tags: [], content, revision: -1, version: 1,
    })).toThrow()
    expect(() => validateDocumentSavePayload({
      id: 'doc-1', title: '标题', categoryId: null, tags: [], content, revision: 0, version: 1.5,
    })).toThrow()
    expect(() => validateDocumentSavePayload({
      id: 'doc-1', title: '标题', categoryId: null, tags: [], content: { type: 'doc', content: [null] }, revision: 0, version: 1,
    })).toThrow()
  })

  it('rejects empty or oversized category names and invalid journal counters', () => {
    expect(() => validateCategorySavePayload({ name: '   ' })).toThrow()
    expect(() => validateCategorySavePayload({ name: 'x'.repeat(81) })).toThrow()
    expect(() => validateJournalSavePayload({
      id: 'journal-1', title: '日志', categoryId: null, content, revision: 0, version: -2,
    })).toThrow()
  })
})
