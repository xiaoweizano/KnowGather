import { describe, expect, it } from 'vitest'
import {
  cloneDocumentJson,
  createDocumentRecord,
  EMPTY_DOCUMENT,
  normalizeDocumentJson,
} from '../src/shared/document'

describe('document JSON contract', () => {
  it('round-trips a structured Tiptap document without losing node attributes', () => {
    const source = {
      type: 'doc' as const,
      content: [
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'center' },
          content: [{ type: 'text', text: '中文标题', marks: [{ type: 'bold' }] }],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '已完成' }] }],
            },
          ],
        },
      ],
    }

    const cloned = cloneDocumentJson(source)
    expect(cloned).toEqual(source)
    expect(cloned).not.toBe(source)
    expect(normalizeDocumentJson(cloned)).toEqual(source)
  })

  it('falls back to one paragraph for corrupted JSON', () => {
    expect(normalizeDocumentJson({ type: 'paragraph', content: [] })).toEqual(EMPTY_DOCUMENT)
    expect(normalizeDocumentJson({ type: 'doc', content: [null, 'bad'] })).toEqual(EMPTY_DOCUMENT)
  })

  it('creates document records with explicit version fields and a safe title', () => {
    const record = createDocumentRecord({
      id: 'doc-1',
      title: '   ',
      content: EMPTY_DOCUMENT,
      now: '2026-11-11T00:00:00.000Z',
    })

    expect(record.title).toBe('无标题文档')
    expect(record.revision).toBe(0)
    expect(record.version).toBe(1)
    expect(record.deletedAt).toBeNull()
    expect(record.tags).toEqual([])
  })
})
