import type { ActivityDay, ActivityPayload } from '../../../shared/settings'
import { localDayKey } from '../../../shared/settings'

export interface HeatmapCell {
  /** `YYYY-MM-DD`, or an empty string for padding cells outside the range. */
  key: string
  /** Midnight-local date for the cell; null for padding cells. */
  date: Date | null
  count: number
  level: 0 | 1 | 2 | 3 | 4
  /** Weekday index, 0 = Sunday … 6 = Saturday. */
  weekday: number
  /**
   * Where the cell falls outside the range when the range does not start on a
   * Sunday or end on a Saturday: `start` pads the first column, `end` the last.
   */
  pad: 'start' | 'end' | null
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
  /** Edits inside the window only; days outside it never leak into the stats. */
  totalEdits: number
  activeDays: number
  /** Consecutive days ending at the newest day in the window. */
  streak: number
  /** Longest run of consecutive active days anywhere in the window. */
  bestStreak: number
  /** Edits today, or in the window's final week when the window ends in the past. */
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
  return buildRange(days, { start, end }, { start, end }, end)
}

/**
 * A calendar year as GitHub shows it: whole weeks from the Sunday on or before
 * January 1st to the Saturday on or after December 31st, clipped to today so a
 * running year does not paint the future. Pass `today = null` to ignore the
 * clock (tests).
 */
export function buildYearHeatmap(
  days: Record<string, ActivityDay>,
  year: number,
  today: Date | null = new Date(),
): HeatmapModel {
  const first = new Date(year, 0, 1)
  const lastDay = new Date(year, 11, 31)
  const clock = today ? startOfLocalDay(today) : null
  const end = clock && clock < lastDay ? clock : lastDay
  // The grid is week-aligned; the year itself is what the stats count, so the
  // neighbouring days that fill the first and last columns stay blank.
  const gridStart = new Date(first.getTime())
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const gridEnd = new Date(end.getTime())
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))
  return buildRange(days, { start: first, end }, { start: gridStart, end: gridEnd }, end)
}

/** Every year that has activity plus the current one, newest first. */
export function activityYears(days: Record<string, ActivityDay>, today = new Date()): number[] {
  const years = new Set<number>([today.getFullYear()])
  for (const [key, day] of Object.entries(days)) {
    if (editsFor(day) <= 0) continue
    const date = parseDayKey(key)
    if (date) years.add(date.getFullYear())
  }
  return [...years].sort((left, right) => right - left)
}

function buildRange(
  days: Record<string, ActivityDay>,
  range: { start: Date; end: Date },
  grid: { start: Date; end: Date },
  statsEnd: Date,
): HeatmapModel {
  const span = Math.max(1, Math.round((grid.end.getTime() - grid.start.getTime()) / 86_400_000) + 1)
  const weeks = Math.ceil(span / 7)

  const columns: HeatmapWeek[] = []
  let totalEdits = 0
  let activeDays = 0
  const cursor = new Date(grid.start.getTime())
  const activeCounts = new Map<string, number>()
  let max = 0

  for (let week = 0; week < weeks; week += 1) {
    const cells: HeatmapCell[] = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(cursor.getTime())
      cursor.setDate(cursor.getDate() + 1)
      if (date < range.start || date > range.end) {
        cells.push({
          key: '',
          date: null,
          count: 0,
          level: 0,
          weekday,
          pad: date < range.start ? 'start' : 'end',
        })
        continue
      }
      const key = localDayKey(date)
      const count = editsFor(days[key])
      if (count > max) max = count
      if (count > 0) {
        totalEdits += count
        activeDays += 1
        activeCounts.set(key, count)
      }
      cells.push({ key, date, count, level: heatLevel(count), weekday, pad: null })
    }
    // The month axis is drawn once per column rather than per cell, and a
    // caption only makes sense on the column whose top row starts the month.
    columns.push({
      cells,
      monthLabel: monthLabelFor(cells, columns.length === 0, columns.at(-1)?.monthLabel ?? null),
    })
  }

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
    streak: computeStreak(activeCounts, statsEnd),
    bestStreak: computeBestStreak(activeCounts, range.start, range.end),
    thisWeek: countWeekEnding(activeCounts, statsEnd),
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
  return countWeekEnding(activeCounts, today)
}

/** Longest run of consecutive active days inside `start`–`end`, inclusive. */
export function computeBestStreak(
  activeCounts: Map<string, number>,
  start: Date,
  end: Date,
): number {
  const cursor = startOfLocalDay(start)
  const last = startOfLocalDay(end)
  let best = 0
  let run = 0
  while (cursor <= last) {
    if (activeCounts.has(localDayKey(cursor))) {
      run += 1
      if (run > best) best = run
    } else {
      run = 0
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return best
}

/** Edits from the Sunday of the week that contains `end` through `end`. */
export function countWeekEnding(activeCounts: Map<string, number>, end: Date): number {
  const last = startOfLocalDay(end)
  const start = new Date(last.getTime())
  start.setDate(start.getDate() - start.getDay())
  let total = 0
  for (const [key, count] of activeCounts) {
    const date = parseDayKey(key)
    if (date && date >= start && date <= last) total += count
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

function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function monthLabelFor(cells: HeatmapCell[], firstColumn: boolean, previousLabel: string | null): string | null {
  // Label the column that holds the first day of the month, once per month. The
  // opening column always gets a caption so the axis does not start blank.
  const firstDay = cells.find((cell) => cell.date?.getDate() === 1)
  const opening = firstColumn ? cells.find((cell) => cell.date)?.date : undefined
  const date = firstDay?.date ?? opening
  if (!date) return null
  const label = `${date.getMonth() + 1}`
  return label === previousLabel ? null : label
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}
