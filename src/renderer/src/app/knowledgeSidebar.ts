import type { CategoryRecord, DocumentRecord, JournalRecord } from '../../../shared/document'
import { translate } from '../i18n'
import type { KnowledgeEntry } from './knowledgeView'

export interface KnowledgeCategoryNode {
  categoryId: string | null
  /** Resolved, localized label (user categories are used verbatim). */
  label: string
  /** i18n key for the built-in nodes; `null` for user categories. */
  labelKey: string | null
  count: number
}

export interface KnowledgeEntryAction {
  enabled: boolean
  reason?: string
}

export type CategoryDraftValidation =
  | { valid: true; name: string }
  | { valid: false; name: string; error: string; errorKey: string }

/**
 * Categories tree for the library. Journals still count towards the tree when
 * they are passed in (the journal list shares the same category totals), but
 * the library sidebar itself only shows documents.
 */
export function buildKnowledgeCategoryTree(
  categories: readonly CategoryRecord[],
  documents: readonly DocumentRecord[],
  journals: readonly JournalRecord[] = [],
): KnowledgeCategoryNode[] {
  const records = [...documents, ...journals]
  const countFor = (categoryId: string | null): number =>
    records.filter((record) => record.categoryId === categoryId).length

  const nodes: KnowledgeCategoryNode[] = [
    { categoryId: 'all', label: translate('library.treeAll'), labelKey: 'library.treeAll', count: records.length },
  ]
  const uncategorizedCount = countFor(null)
  if (uncategorizedCount > 0) {
    nodes.push({
      categoryId: null,
      label: translate('library.treeUncategorized'),
      labelKey: 'library.treeUncategorized',
      count: uncategorizedCount,
    })
  }

  for (const category of [...categories].sort((left, right) => left.id.localeCompare(right.id))) {
    nodes.push({
      categoryId: category.id,
      label: category.name,
      labelKey: null,
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
  return { enabled: true }
}

export function validateCategoryDraft(
  draft: string,
  categories: readonly CategoryRecord[],
): CategoryDraftValidation {
  const name = draft.trim()
  if (!name) {
    return { valid: false, name: '', error: translate('library.validation.empty'), errorKey: 'library.validation.empty' }
  }
  if (Array.from(name).length > 80) {
    return {
      valid: false,
      name,
      error: translate('library.validation.tooLong'),
      errorKey: 'library.validation.tooLong',
    }
  }
  const normalized = name.toLocaleLowerCase('zh-CN')
  if (categories.some((category) => category.name.trim().toLocaleLowerCase('zh-CN') === normalized)) {
    return {
      valid: false,
      name,
      error: translate('library.validation.duplicate'),
      errorKey: 'library.validation.duplicate',
    }
  }
  return { valid: true, name }
}
