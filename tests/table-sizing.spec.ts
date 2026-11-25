import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TABLE_COLUMNS,
  DEFAULT_TABLE_ROWS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  clampTableSize,
  tableSizeFromCell,
} from '../src/renderer/src/editor/core/tableSizing'

describe('table sizing', () => {
  it('maps a grid cell to its size, counting from one', () => {
    expect(tableSizeFromCell(0, 0)).toEqual({ rows: 1, columns: 1 })
    expect(tableSizeFromCell(2, 3)).toEqual({ rows: 3, columns: 4 })
    expect(tableSizeFromCell(9, 9)).toEqual({ rows: MAX_TABLE_ROWS, columns: MAX_TABLE_COLUMNS })
  })

  it('never asks for more than the picker offers', () => {
    expect(clampTableSize({ rows: 99, columns: 99 })).toEqual({ rows: MAX_TABLE_ROWS, columns: MAX_TABLE_COLUMNS })
    expect(tableSizeFromCell(40, 40)).toEqual({ rows: MAX_TABLE_ROWS, columns: MAX_TABLE_COLUMNS })
  })

  it('never asks for a table with zero rows or columns', () => {
    expect(clampTableSize({ rows: 0, columns: -3 })).toEqual({ rows: 1, columns: 1 })
    expect(tableSizeFromCell(-1, -1)).toEqual({ rows: 1, columns: 1 })
  })

  it('falls back to the defaults for unusable input', () => {
    const fallback = { rows: DEFAULT_TABLE_ROWS, columns: DEFAULT_TABLE_COLUMNS }
    expect(clampTableSize({})).toEqual(fallback)
    expect(clampTableSize({ rows: Number.NaN, columns: 'abc' })).toEqual(fallback)
  })

  it('rounds fractional sizes to whole cells', () => {
    expect(clampTableSize({ rows: 2.4, columns: 4.6 })).toEqual({ rows: 2, columns: 5 })
  })
})