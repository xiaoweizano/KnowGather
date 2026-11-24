import { describe, expect, it } from 'vitest'
import type { DocumentRecord, JournalRecord } from '../src/shared/document'
import {
  buildCategoryCounts,
  filterKnowledgeEntries,
  formatKnowledgeUpdatedAt,
} from '../src/renderer/src/app/knowledgeView'

const at = '2026-11-11T08:30:00.000Z'

function document(id: string, title: string, categoryId: string | null, tags: string[] = []): DocumentRecord {
  return {
    id,
    title,
    categoryId,
    tags,
    content: { type: 'doc', content: [] },
    revision: 1,
    version: 2,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}

function journal(id: string, title: string, categoryId: string | null): JournalRecord {
  return {
    id,
    title,
    categoryId,
    content: { type: 'doc', content: [] },
    revision: 1,
    version: 2,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}

describe('knowledge view data', () => {
  const documents = [
    document('doc-a', '工作复盘', 'work', ['重要']),
    document('doc-b', '学习记录', 'study', ['复盘']),
    document('doc-c', '未分类记录', null),
  ]
  const journals = [
    journal('journal-a', '今日工作日志', 'work'),
    journal('journal-b', '学习日志', 'study'),
  ]

  it('builds category counts from persisted documents and journals', () => {
    expect(buildCategoryCounts(documents, journals)).toEqual([
      { categoryId: null, documentCount: 1, journalCount: 0, total: 1 },
      { categoryId: 'work', documentCount: 1, journalCount: 1, total: 2 },
      { categoryId: 'study', documentCount: 1, journalCount: 1, total: 2 },
    ])
    expect(buildCategoryCounts(documents, journals, true)).toEqual([
      { categoryId: null, documentCount: 1, journalCount: 0, total: 1 },
      { categoryId: 'work', documentCount: 1, journalCount: 1, total: 2 },
      { categoryId: 'study', documentCount: 1, journalCount: 1, total: 2 },
      { categoryId: 'all', documentCount: 3, journalCount: 2, total: 5 },
    ])
  })

  it('combines category and keyword filters for documents and journals', () => {
    expect(filterKnowledgeEntries(documents, journals, { categoryId: 'work', query: '' }).map((entry) => entry.id))
      .toEqual(['doc-a', 'journal-a'])
    expect(filterKnowledgeEntries(documents, journals, { categoryId: null, query: '' }).map((entry) => entry.id))
      .toEqual(['doc-c'])
    expect(filterKnowledgeEntries(documents, journals, { categoryId: 'all', query: '复盘' }).map((entry) => entry.id))
      .toEqual(['doc-a', 'doc-b'])
    expect(filterKnowledgeEntries(documents, journals, { categoryId: 'all', query: '日志' }).map((entry) => entry.id))
      .toEqual(['journal-a', 'journal-b'])
  })

  it('formats real update dates as today, yesterday, or a date', () => {
    const now = new Date(2026, 10, 13, 10, 0)
    expect(formatKnowledgeUpdatedAt(new Date(2026, 10, 13, 9, 5).toISOString(), now)).toMatch(/^今天 /)
    expect(formatKnowledgeUpdatedAt(new Date(2026, 10, 12, 18, 5).toISOString(), now)).toMatch(/^昨天 /)
    expect(formatKnowledgeUpdatedAt(new Date(2026, 10, 1, 8, 5).toISOString(), now)).toBe('11月01日')
    expect(formatKnowledgeUpdatedAt('invalid', now)).toBe('时间未知')
  })

  it('includes the year for dates from another year', () => {
    const now = new Date(2026, 10, 13, 10, 0)
    expect(formatKnowledgeUpdatedAt(new Date(2024, 4, 20, 12).toISOString(), now)).toBe('2024年05月20日')
    expect(formatKnowledgeUpdatedAt(new Date(2024, 4, 20, 12).toISOString(), now, 'en-US')).toBe('2024/05/20')
  })

  it('formats dates in English when that locale is requested', () => {
    const now = new Date(2026, 10, 13, 10, 0)
    expect(formatKnowledgeUpdatedAt(new Date(2026, 10, 13, 9, 5).toISOString(), now, 'en-US')).toMatch(/^Today /)
    expect(formatKnowledgeUpdatedAt(new Date(2026, 10, 12, 18, 5).toISOString(), now, 'en-US')).toMatch(/^Yesterday /)
    expect(formatKnowledgeUpdatedAt(new Date(2026, 10, 1, 8, 5).toISOString(), now, 'en-US')).toBe('11/01')
  })
})
