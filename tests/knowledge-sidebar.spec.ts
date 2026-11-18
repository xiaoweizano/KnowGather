import { describe, expect, it } from 'vitest'
import type { CategoryRecord, DocumentRecord, JournalRecord } from '../src/shared/document'
import {
  buildKnowledgeCategoryTree,
  limitKnowledgeEntries,
  resolveKnowledgeEntryAction,
  validateCategoryDraft,
} from '../src/renderer/src/app/knowledgeSidebar'
import {
  filterKnowledgeEntries,
  type KnowledgeEntry,
} from '../src/renderer/src/app/knowledgeView'

const base = new Date(2026, 10, 13, 9, 30).toISOString()

function category(id: string, name: string): CategoryRecord {
  return { id, name, createdAt: base, updatedAt: base, deletedAt: null }
}

function document(id: string, title: string, categoryId: string | null, updatedAt: string): DocumentRecord {
  return {
    id,
    title,
    categoryId,
    tags: [],
    content: { type: 'doc', content: [] },
    revision: 1,
    version: 2,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  }
}

function journal(id: string, title: string, categoryId: string | null, updatedAt: string): JournalRecord {
  return {
    id,
    title,
    categoryId,
    content: { type: 'doc', content: [] },
    revision: 1,
    version: 2,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  }
}

const documents = [
  document('doc-old', '工作复盘', 'work', new Date(2026, 10, 12, 8).toISOString()),
  document('doc-new', '本周计划', 'work', new Date(2026, 10, 13, 9).toISOString()),
  document('doc-loose', '随手记', null, new Date(2026, 10, 13, 8).toISOString()),
]
const journals = [
  journal('journal-new', '今日工作日志', 'work', new Date(2026, 10, 13, 10).toISOString()),
  journal('journal-study', '学习日志', 'study', new Date(2026, 10, 11, 10).toISOString()),
]

describe('knowledge sidebar data', () => {
  it('builds the tree from persisted categories and keeps empty categories visible', () => {
    const tree = buildKnowledgeCategoryTree(
      [category('study', '学习'), category('empty', '空分类'), category('work', '工作')],
      documents,
      journals,
    )

    expect(tree.map((node) => ({ id: node.categoryId, label: node.label, key: node.labelKey, count: node.count }))).toEqual([
      { id: 'all', label: '全部知识', key: 'library.treeAll', count: 5 },
      { id: null, label: '未分类', key: 'library.treeUncategorized', count: 1 },
      { id: 'empty', label: '空分类', key: null, count: 0 },
      { id: 'study', label: '学习', key: null, count: 1 },
      { id: 'work', label: '工作', key: null, count: 3 },
    ])
  })

  it('sorts merged document and journal results by real update time', () => {
    const entries = filterKnowledgeEntries(documents, journals, { categoryId: 'work', query: '' })

    expect(entries.map((entry) => entry.id)).toEqual(['journal-new', 'doc-new', 'doc-old'])
    expect(entries.map((entry) => entry.kind)).toEqual(['journal', 'document', 'document'])
  })

  it('searches both journals and documents and keeps category filtering active', () => {
    expect(filterKnowledgeEntries(documents, journals, { categoryId: 'all', query: '日志' }).map((entry) => entry.id))
      .toEqual(['journal-new', 'journal-study'])
    expect(filterKnowledgeEntries(documents, journals, { categoryId: 'study', query: '工作' })).toEqual([])
  })

  it('limits recent entries until the user explicitly expands the list', () => {
    const entries = filterKnowledgeEntries(documents, journals, { categoryId: 'all', query: '' })

    expect(limitKnowledgeEntries(entries, false, 2).map((entry) => entry.id)).toEqual([
      'journal-new',
      'doc-new',
    ])
    expect(limitKnowledgeEntries(entries, true, 2).map((entry) => entry.id)).toHaveLength(5)
  })

  it('treats both documents and journals as editable entries', () => {
    const entries = filterKnowledgeEntries(documents, journals, { categoryId: 'all', query: '' })
    const journalEntry = entries.find((entry) => entry.kind === 'journal') as KnowledgeEntry
    const documentEntry = entries.find((entry) => entry.kind === 'document') as KnowledgeEntry

    expect(resolveKnowledgeEntryAction(documentEntry)).toEqual({ enabled: true })
    expect(resolveKnowledgeEntryAction(journalEntry)).toEqual({ enabled: true })
  })

  it('trims category names and rejects empty, overlong, and duplicate names before persistence', () => {
    const categories = [category('work', '工作')]

    expect(validateCategoryDraft('  学习  ', categories)).toEqual({ valid: true, name: '学习' })
    expect(validateCategoryDraft('   ', categories)).toEqual({
      valid: false,
      name: '',
      error: '请输入分类名称',
      errorKey: 'library.validation.empty',
    })
    expect(validateCategoryDraft('x'.repeat(81), categories)).toEqual({
      valid: false,
      name: 'x'.repeat(81),
      error: '分类名称不能超过 80 个字符',
      errorKey: 'library.validation.tooLong',
    })
    expect(validateCategoryDraft(' 工作 ', categories)).toEqual({
      valid: false,
      name: '工作',
      error: '已存在同名分类',
      errorKey: 'library.validation.duplicate',
    })
  })
})
