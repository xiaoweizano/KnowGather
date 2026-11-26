import type { JournalRecord } from '../../../shared/document'

export type AppPage = 'home' | 'library' | 'journal' | 'assistant' | 'settings'
export type NavigationKey = 'home' | 'library' | 'journal' | 'assistant' | 'settings'

export interface NavigationTarget {
  page: AppPage
  implemented: boolean
}

export function resolveNavigationTarget(key: NavigationKey): NavigationTarget {
  return { page: key, implemented: true }
}

function localDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Local `YYYY-MM-DD` for the clock; the heatmap keys days the same way. */
export function todayDayKey(now = new Date()): string {
  return localDateKey(now)
}

export function countJournalsForLocalDate(journals: readonly JournalRecord[], now = new Date()): number {
  const target = localDateKey(now)
  // Entries belong to the day they were written (`createdAt`), not the day they
  // were last edited, so editing yesterday's entry still counts as yesterday.
  return journals.reduce((count, journal) => {
    const date = new Date(journal.createdAt)
    return Number.isNaN(date.getTime()) || localDateKey(date) !== target ? count : count + 1
  }, 0)
}

/** Map of local days that already have a journal entry, for heatmap labels. */
export function journalDaysSet(journals: readonly JournalRecord[]): Record<string, true> {
  const days: Record<string, true> = {}
  for (const journal of journals) {
    const date = new Date(journal.createdAt)
    if (!Number.isNaN(date.getTime())) days[localDateKey(date)] = true
  }
  return days
}

export interface KnowledgeSearchShortcut {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  isComposing?: boolean
}

export function shouldFocusKnowledgeSearch(event: KnowledgeSearchShortcut): boolean {
  return !event.isComposing && event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)
}

/**
 * The knowledge search shortcut must not steal Ctrl+K from the editor, where the
 * same combination inserts a link. Any keystroke that starts inside the document
 * body belongs to the editor.
 */
export function shouldYieldShortcutToEditor(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return (target as Element).closest('.shizhi-editor') !== null
}
