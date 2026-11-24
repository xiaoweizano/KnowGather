import { describe, expect, it } from 'vitest'
import { inferImportDate } from '../src/main/importers/dateInference'

const now = new Date(2026, 10, 19) // 2026-11-19

describe('import date inference', () => {
  it('reads a full date from the file name', () => {
    expect(inferImportDate('20240520.txt', null, now)).toBe('2024-05-20')
    expect(inferImportDate('2024-05-20.md', null, now)).toBe('2024-05-20')
    expect(inferImportDate('2024.05.20 工作记录.md', null, now)).toBe('2024-05-20')
    expect(inferImportDate('20240520_周报.docx', null, now)).toBe('2024-05-20')
  })

  it('combines a bare day file name with its month folder', () => {
    expect(inferImportDate('202405/22.txt', null, now)).toBe('2024-05-22')
    expect(inferImportDate('2024-05/22.txt', null, now)).toBe('2024-05-22')
    expect(inferImportDate('2024/05/22.txt', null, now)).toBe('2024-05-22')
    expect(inferImportDate('日记/202405/5.md', null, now)).toBe('2024-05-05')
  })

  it('lets the file name win over the folder', () => {
    expect(inferImportDate('202405/20240601.txt', null, now)).toBe('2024-06-01')
  })

  it('uses the file time when the month folder has no day', () => {
    expect(inferImportDate('202405/会议记录.txt', new Date(2024, 4, 11, 9, 30), now)).toBe('2024-05-11')
    // A file copied in July cannot claim a day in May; the folder wins as a
    // coarse bucket instead of inventing a date from the copy time.
    expect(inferImportDate('202405/会议记录.txt', new Date(2024, 6, 2, 9, 30), now)).toBe('2024-05-01')
    expect(inferImportDate('202405/会议记录.txt', null, now)).toBe('2024-05-01')
  })

  it('falls back to the modification time when nothing is named', () => {
    expect(inferImportDate('会议记录.txt', new Date(2024, 2, 11, 9, 30), now)).toBe('2024-03-11')
    expect(inferImportDate('笔记/会议记录.md', null, now)).toBeNull()
  })

  it('reads dates inside archive entry paths', () => {
    expect(inferImportDate('归档/202406/07.txt', null, now)).toBe('2024-06-07')
    expect(inferImportDate('归档/202406/20240618.txt', null, now)).toBe('2024-06-18')
  })

  it('rejects impossible or future dates instead of guessing', () => {
    expect(inferImportDate('202413/01.txt', null, now)).toBeNull()
    // An impossible day falls back to the month folder's first day.
    expect(inferImportDate('202405/32.txt', null, now)).toBe('2024-05-01')
    expect(inferImportDate('20240230.txt', null, now)).toBeNull()
    expect(inferImportDate('29991231.txt', null, now)).toBeNull()
    // 2026-12 is still in the future on 2026-11-19.
    expect(inferImportDate('202612/01.txt', null, now)).toBeNull()
  })

  it('does not treat arbitrary numbers as dates', () => {
    expect(inferImportDate('1.办理入职.txt', null, now)).toBeNull()
    expect(inferImportDate('1234.txt', null, now)).toBeNull()
    expect(inferImportDate('第22天.txt', null, now)).toBeNull()
  })
})