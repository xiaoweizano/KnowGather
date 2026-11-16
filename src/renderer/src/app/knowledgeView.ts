import type { DocumentRecord, JournalRecord } from '../../../shared/document'

export interface CategoryCount {
  categoryId: string | null
  documentCount: number
  journalCount: number
  total: number
}

export interface KnowledgeEntry {
  id: string
  kind: 'document' | 'journal'
  title: string
  categoryId: string | null
  tags: string[]
  updatedAt: string
  record: DocumentRecord | JournalRecord
}

export interface KnowledgeFilter {
  categoryId: string | null
  query: string
}

export function buildCategoryCounts(
  documents: readonly DocumentRecord[],
  journals: readonly JournalRecord[],
  includeAll = false,
): CategoryCount[] {
  const categoryIds: (string | null)[] = [null]
  for (const record of [...documents, ...journals]) {
    if (record.categoryId !== null && !categoryIds.includes(record.categoryId)) categoryIds.push(record.categoryId)
  }
  const counts = categoryIds.map((categoryId) => {
    const documentCount = documents.filter((document) => document.categoryId === categoryId).length
    const journalCount = journals.filter((journal) => journal.categoryId === categoryId).length
    return { categoryId, documentCount, journalCount, total: documentCount + journalCount }
  })
  if (includeAll) {
    counts.push({
      categoryId: 'all',
      documentCount: documents.length,
      journalCount: journals.length,
      total: documents.length + journals.length,
    })
  }
  return counts
}

function toEntry(record: DocumentRecord | JournalRecord, kind: KnowledgeEntry['kind']): KnowledgeEntry {
  return {
    id: record.id,
    kind,
    title: record.title,
    categoryId: record.categoryId,
    tags: kind === 'document' ? (record as DocumentRecord).tags : [],
    updatedAt: record.updatedAt,
    record,
  }
}

export function filterKnowledgeEntries(
  documents: readonly DocumentRecord[],
  journals: readonly JournalRecord[],
  filter: KnowledgeFilter,
): KnowledgeEntry[] {
  const query = filter.query.trim().toLocaleLowerCase('zh-CN')
  const matches = (entry: KnowledgeEntry): boolean => {
    if (filter.categoryId !== 'all' && entry.categoryId !== filter.categoryId) return false
    if (!query) return true
    return entry.title.toLocaleLowerCase('zh-CN').includes(query)
      || entry.tags.some((tag) => tag.toLocaleLowerCase('zh-CN').includes(query))
  }
  return [
    ...documents.filter((record) => matches(toEntry(record, 'document'))).map((record) => toEntry(record, 'document')),
    ...journals.filter((record) => matches(toEntry(record, 'journal'))).map((record) => toEntry(record, 'journal')),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function localDayNumber(value: Date): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000
}

export function formatKnowledgeUpdatedAt(value: string, now = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  const dayDifference = localDayNumber(now) - localDayNumber(date)
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  if (dayDifference === 0) return `今天 ${time}`
  if (dayDifference === 1) return `昨天 ${time}`
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date).replace('/', '月') + '日'
}
