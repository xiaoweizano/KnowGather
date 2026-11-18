import type { ActivityDay, ActivityPayload } from '../../../shared/settings'
import { localDayKey } from '../../../shared/settings'

export interface HeatmapCell {
  /** `YYYY-MM-DD`, or an empty string for padding cells before the first day. */
  key: string
  /** Midnight-local date for the cell; null for padding cells. */
  date: Date | null
  count: number
  level: 0 | 1 | 2 | 3 | 4
  /** Weekday index, 0 = Sunday … 6 = Saturday. */
  weekday: number
}

export interface HeatmapWeek {
  cells: HeatmapCell[]
  /** Month label shown above a week when it starts a new month. */
  monthLabel: string | null
}

export interface HeatmapModel {
  weeks: HeatmapWeek[]
  /** Month captions with the week index they belong above. */
  monthCaptions: Array<{ week: number; label: string }>
  /** Busiest day in the window, used to scale the colour levels. */
  max: number
  totalEdits: number
  activeDays: number
  streak: number
  thisWeek: number
}

export const HEATMAP_WEEKS = 53
export const WEEKDAY_LABELS_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const
export const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * Builds the GitHub-style grid: columns are weeks (oldest first), rows are
 * weekdays. The window ends today and starts on the Sunday 52 weeks earlier, so
 * the current week is the last, partially-filled column.
 */
export function buildHeatmap(
  days: Record<string, ActivityDay>,
  today = new Date(),
  weeks = HEATMAP_WEEKS,
): HeatmapModel {
  const end = startOfLocalDay(today)
  // Align to the Sunday of the current week, then step back whole weeks so the
  // final column always contains today.
  const start = new Date(end.getTime())
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7)

  const columns: HeatmapWeek[] = []
  let totalEdits = 0
  let activeDays = 0
  const cursor = new Date(start.getTime())
  const activeCounts = new Map<string, number>()

  for (let week = 0; week < weeks; week += 1) {
    const cells: HeatmapCell[] = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(cursor.getTime())
      cursor.setDate(cursor.getDate() + 1)
      if (date > end) {
        cells.push({ key: '', date: null, count: 0, level: 0, weekday })
        continue
      }
      const key = localDayKey(date)
      const count = editsFor(days[key])
      if (count > 0) {
        totalEdits += count
        activeDays += 1
        activeCounts.set(key, count)
      }
      cells.push({ key, date, count, level: heatLevel(count), weekday })
    }
    columns.push({ cells, monthLabel: monthLabelFor(cells) })
  }

  const max = maxEdits(days)
  for (const week of columns) {
    for (const cell of week.cells) cell.level = heatLevel(cell.count, max)
  }

  return {
    weeks: columns,
    monthCaptions: columns
      .map((week, index) => ({ week: index, label: week.monthLabel }))
      .filter((entry): entry is { week: number; label: string } => entry.label !== null),
    max,
    totalEdits,
    activeDays,
    streak: computeStreak(activeCounts, end),
    thisWeek: countThisWeek(activeCounts, end),
  }
}

/** 0 for no activity, then quartiles of the busiest day in the window. */
export function heatLevel(count: number, max = 4): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (max <= 1) return 1
  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

/**
 * Consecutive days with at least one edit, counting back from today. A gap
 * today does not break a streak that is still alive through yesterday, because
 * the day is not over yet.
 */
export function computeStreak(activeCounts: Map<string, number>, today = new Date()): number {
  const cursor = startOfLocalDay(today)
  if (!activeCounts.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  let streak = 0
  while (activeCounts.has(localDayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function countThisWeek(activeCounts: Map<string, number>, today = new Date()): number {
  const end = startOfLocalDay(today)
  const start = new Date(end.getTime())
  start.setDate(start.getDate() - start.getDay())
  let total = 0
  for (const [key, count] of activeCounts) {
    const date = parseDayKey(key)
    if (date && date >= start && date <= end) total += count
  }
  return total
}

/** Legend thresholds for the "less → more" scale. */
export function heatLegend(max: number): Array<{ level: 0 | 1 | 2 | 3 | 4; count: number }> {
  return [0, 1, 2, 3, 4].map((level) => ({
    level: level as 0 | 1 | 2 | 3 | 4,
    count: level === 0 ? 0 : Math.max(1, Math.round((max * level) / 4)),
  }))
}

/** Busiest day in the activity payload; also accepts the raw day map. */
export function maxEdits(source: ActivityPayload | Record<string, ActivityDay>): number {
  const days = 'days' in source ? source.days : source
  let max = 0
  for (const day of Object.values(days)) {
    const count = editsFor(day)
    if (count > max) max = count
  }
  return max
}

function editsFor(day: ActivityDay | undefined): number {
  if (!day) return 0
  // Document edits and journal entries both count towards the same intensity.
  return Math.max(0, day.edits || 0)
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function monthLabelFor(cells: HeatmapCell[]): string | null {
  const firstReal = cells.find((cell) => cell.date !== null)
  if (!firstReal?.date) return null
  const firstWeekday = cells.findIndex((cell) => cell.date !== null)
  // Label a column when the month changes inside it and it is the first that day.
  const previousMonth = firstWeekday > 0 ? cells[firstWeekday - 1]?.date?.getMonth() : undefined
  if (firstWeekday > 0 && previousMonth === firstReal.date.getMonth()) return null
  return `${firstReal.date.getMonth() + 1}`
}
