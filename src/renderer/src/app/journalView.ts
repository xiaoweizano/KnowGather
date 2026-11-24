import { currentLocale, translateIn } from '../i18n'
import type { JournalRecord } from '../../../shared/document'
import { localDayKey } from '../../../shared/settings'

/**
 * Formats journal metadata for the journal list. Kept separate from the
 * knowledge sidebar formatter so the journal page can show a full date.
 */
export function formatJournalDate(value: string, locale?: 'zh-CN' | 'en-US'): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return translateIn(toLocale(locale), 'time.unknown')
  return new Intl.DateTimeFormat(toLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-')
}

/**
 * Journal titles are generated at creation time and written to the database, so
 * they stay in one fixed format regardless of the interface language.
 */

function toLocale(value: 'zh-CN' | 'en-US' | undefined): 'zh-CN' | 'en-US' {
  return value ?? currentLocale()
}

/**
 * The generated title is data, not UI chrome: it is written into the database
 * and must not change when the interface language changes.
 */
export function journalTitleForDate(date: Date | string = new Date()): string {
  const dayKey = typeof date === 'string' ? date : localDayKey(date)
  return `${dayKey} 日志`
}

/** Local `YYYY-MM-DD` for an ISO timestamp, or null when it cannot be parsed. */
export function localDayKeyOf(value: string): string | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : localDayKey(date)
}

/**
 * Finds the entry that belongs to a local calendar day. The day is stored in
 * `createdAt`, so editing an old entry does not move it to today. Same-day
 * entries (a manual one plus an imported one) resolve deterministically: the
 * oldest first, then by id.
 */
export function journalForDay(journals: readonly JournalRecord[], dayKey: string): JournalRecord | undefined {
  return journals
    .filter((journal) => localDayKeyOf(journal.createdAt) === dayKey)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0]
}

/** Date-only label for an entry; the clock time is noise for a daily journal. */
export function formatJournalDay(value: string, locale?: 'zh-CN' | 'en-US'): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return translateIn(toLocale(locale), 'time.unknown')
  return new Intl.DateTimeFormat(toLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-')
}
