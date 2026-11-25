/**
 * Table sizing shared by the insert picker and the edge handles.
 *
 * Kept free of Vue so the clamping rules can be tested directly: a picker
 * hit-test and a drag both end up asking for "N by M", and both must land in
 * the range the picker offers.
 */
export const MAX_TABLE_ROWS = 10
export const MAX_TABLE_COLUMNS = 10
export const DEFAULT_TABLE_ROWS = 3
export const DEFAULT_TABLE_COLUMNS = 3

function clamp(value: unknown, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(1, Math.round(number)))
}

export function clampTableSize(size: { rows?: unknown; columns?: unknown }): { rows: number; columns: number } {
  return {
    rows: clamp(size.rows, MAX_TABLE_ROWS, DEFAULT_TABLE_ROWS),
    columns: clamp(size.columns, MAX_TABLE_COLUMNS, DEFAULT_TABLE_COLUMNS),
  }
}

/**
 * Rows and columns for the cell under a pointer, where (0, 0) is the
 * top-left of the picker grid.
 */
export function tableSizeFromCell(row: number, column: number): { rows: number; columns: number } {
  return clampTableSize({ rows: row + 1, columns: column + 1 })
}