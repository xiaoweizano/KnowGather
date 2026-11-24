/**
 * Infers the calendar date an imported file belongs to.
 *
 * Imported folders are often named after their month (`202405`) and files after
 * their day (`20240520.txt`, `22.txt`). When neither carries a date the file's
 * modification time is the closest honest answer; a file copied from elsewhere
 * usually keeps it. Nothing is guessed: an implausible date (February 30th, a
 * month of 13, a future day) is discarded and the next source is tried.
 */

const COMPACT_DAY = /^(\d{4})(\d{2})(\d{2})(?!\d)/
const DASHED_DAY = /^(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/
const BARE_DAY = /^\d{1,2}$/
const COMPACT_MONTH = /^(\d{4})(\d{2})$/
const DASHED_MONTH = /^(\d{4})[-_.](\d{1,2})$/
const YEAR_ONLY = /^(\d{4})$/

export function inferImportDate(
  labelPath: string,
  modifiedAt: Date | null,
  now = new Date(),
): string | null {
  const today = startOfLocalDay(now)
  const segments = labelPath.split(/[\\/]/).filter(Boolean)
  const fileName = segments.pop() ?? ''
  const stem = fileName.replace(/\.[^.]+$/, '')
  const folders = segments

  const adoption = (year: number, month: number, day: number): string | null => {
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
    if (date > today) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // 1. The file name carries the full date.
  const ownDate = parseFullDate(stem)
  if (ownDate) {
    const accepted = adoption(ownDate.year, ownDate.month, ownDate.day)
    if (accepted) return accepted
  }

  const month = nearestMonth(folders)
  const folderDate = nearestFullDate(folders)

  // 2. A bare day number in the file name, in the context of a month folder.
  if (month && BARE_DAY.test(stem)) {
    const accepted = adoption(month.year, month.month, Number(stem))
    if (accepted) return accepted
  }

  // 3. A folder named after the full date covers every file inside it.
  if (folderDate) {
    const accepted = adoption(folderDate.year, folderDate.month, folderDate.day)
    if (accepted) return accepted
  }

  // 4. A month folder with no day: keep the file's own day when it falls inside.
  if (month) {
    if (modifiedAt && modifiedAt.getFullYear() === month.year && modifiedAt.getMonth() === month.month - 1) {
      const accepted = adoption(month.year, month.month, modifiedAt.getDate())
      if (accepted) return accepted
    }
    const firstOfMonth = adoption(month.year, month.month, 1)
    if (firstOfMonth) return firstOfMonth
  }

  // 5. Last resort: the file system timestamp.
  if (modifiedAt && !Number.isNaN(modifiedAt.getTime())) {
    const accepted = adoption(modifiedAt.getFullYear(), modifiedAt.getMonth() + 1, modifiedAt.getDate())
    if (accepted) return accepted
  }

  return null
}

interface YearMonthDay {
  year: number
  month: number
  day: number
}

function parseFullDate(value: string): YearMonthDay | null {
  const match = COMPACT_DAY.exec(value) ?? DASHED_DAY.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

/** The closest ancestor folder that names a month, e.g. `202405` or `2024-05`. */
function nearestMonth(folders: readonly string[]): { year: number; month: number } | null {
  // Deepest first, so `2024/202405` prefers the explicit month folder.
  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const match = COMPACT_MONTH.exec(folders[index]!) ?? DASHED_MONTH.exec(folders[index]!)
    if (!match) continue
    const year = Number(match[1])
    const month = Number(match[2])
    if (month >= 1 && month <= 12) return { year, month }
  }
  // `2024/05/22.txt`: a year folder followed by a bare month folder.
  for (let index = folders.length - 2; index >= 0; index -= 1) {
    const yearMatch = YEAR_ONLY.exec(folders[index]!)
    const monthMatch = BARE_DAY.exec(folders[index + 1]!)
    if (!yearMatch || !monthMatch) continue
    const month = Number(monthMatch[0])
    if (month >= 1 && month <= 12) return { year: Number(yearMatch[1]), month }
  }
  return null
}

/** The closest ancestor folder that names a full date, e.g. `20240522`. */
function nearestFullDate(folders: readonly string[]): YearMonthDay | null {
  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const match = parseFullDate(folders[index]!)
    if (match) return match
  }
  return null
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}