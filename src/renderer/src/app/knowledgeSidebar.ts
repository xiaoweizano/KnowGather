import type { CategoryRecord, DocumentRecord, JournalRecord } from '../../../shared/document'
import type { KnowledgeEntry } from './knowledgeView'

export interface KnowledgeCategoryNode {
  categoryId: string | null
  label: string
  count: number
}

export interface KnowledgeEntryAction {
  enabled: boolean
  reason?: string
}

export type CategoryDraftValidation =
  | { valid: true; name: string }
  | { valid: false; name: string; error: string }

export function buildKnowledgeCategoryTree(
  categories: readonly CategoryRecord[],
  documents: readonly DocumentRecord[],
  journals: readonly JournalRecord[],
): KnowledgeCategoryNode[] {
  const records = [...documents, ...journals]
  const countFor = (categoryId: string | null): number =>
    records.filter((record) => record.categoryId === categoryId).length

  const nodes: KnowledgeCategoryNode[] = [
    { categoryId: 'all', label: '全部知识', count: records.length },
  ]
  const uncategorizedCount = countFor(null)
  if (uncategorizedCount > 0) {
    nodes.push({ categoryId: null, label: '未分类', count: uncategorizedCount })
  }

  for (const category of [...categories].sort((left, right) => left.id.localeCompare(right.id))) {
    nodes.push({
      categoryId: category.id,
      label: category.name,
      count: countFor(category.id),
    })
  }
  return nodes
}

export function limitKnowledgeEntries(
  entries: readonly KnowledgeEntry[],
  expanded: boolean,
  limit: number,
): KnowledgeEntry[] {
  const safeLimit = Math.max(0, Math.floor(limit))
  return expanded ? [...entries] : entries.slice(0, safeLimit)
}

export function resolveKnowledgeEntryAction(entry: KnowledgeEntry): KnowledgeEntryAction {
  if (entry.kind === 'journal') {
    return { enabled: false, reason: '日志编辑尚未接入，当前仅展示' }
  }
  return { enabled: true }
}

export function validateCategoryDraft(
  draft: string,
  categories: readonly CategoryRecord[],
): CategoryDraftValidation {
  const name = draft.trim()
  if (!name) return { valid: false, name: '', error: '请输入分类名称' }
  if (Array.from(name).length > 80) {
    return { valid: false, name, error: '分类名称不能超过 80 个字符' }
  }
  const normalized = name.toLocaleLowerCase('zh-CN')
  if (categories.some((category) => category.name.trim().toLocaleLowerCase('zh-CN') === normalized)) {
    return { valid: false, name, error: '已存在同名分类' }
  }
  return { valid: true, name }
}
