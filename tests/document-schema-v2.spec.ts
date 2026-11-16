import { describe, expect, it } from 'vitest'
import { createDocumentRecord, normalizeDocumentJson } from '../src/shared/document'

describe('document schema v2 migration and validation', () => {
  it('adds categoryId when creating a new document', () => {
    const record = createDocumentRecord({
      id: 'doc-v2',
      title: '分类文档',
      categoryId: 'category-1',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      now: '2026-11-13T00:00:00.000Z',
    })

    expect(record.categoryId).toBe('category-1')
    expect(record.revision).toBe(0)
    expect(record.version).toBe(1)
  })

  it('rejects malformed Tiptap content instead of silently replacing it with an empty document', () => {
    expect(() => normalizeDocumentJson({ type: 'doc', content: [null, 'bad'] })).toThrow()
    expect(() => normalizeDocumentJson({ type: 'paragraph', content: [] })).toThrow()
    expect(() => normalizeDocumentJson({ type: 'doc', content: [{ type: 'text', text: 42 }] })).toThrow()
  })

  it('accepts a valid empty Tiptap document and preserves node attributes', () => {
    const source = {
      type: 'doc' as const,
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '标题' }] }],
    }
    expect(normalizeDocumentJson(source)).toEqual(source)
    expect(normalizeDocumentJson({ type: 'doc', content: [] })).toEqual({ type: 'doc', content: [] })
  })
})
