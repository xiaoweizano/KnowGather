import { currentLocale, translateIn } from '../i18n'

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
export function journalTitleForDate(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day} 日志`
}
