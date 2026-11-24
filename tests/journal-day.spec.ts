import { describe, expect, it } from 'vitest'
import type { JournalRecord } from '../src/shared/document'
import { isTiptapDocument } from '../src/shared/document'
import { journalForDay, journalTitleForDate, localDayKeyOf } from '../src/renderer/src/app/journalView'
import { countJournalsForLocalDate, journalDaysSet, todayDayKey } from '../src/renderer/src/app/knowledgeNavigation'
import { BUILTIN_JOURNAL_TEMPLATES, journalTemplateLabel, promoteTitleFromJournal } from '../src/renderer/src/app/journalTemplates'

function journal(id: string, createdAt: string, updatedAt = createdAt): JournalRecord {
  return {
    id,
    title: id,
    content: { type: 'doc', content: [] },
    categoryId: null,
    revision: 1,
    version: 2,
    createdAt,
    updatedAt,
    deletedAt: null,
  }
}

describe('journal day identity', () => {
  it('generates the fixed data title from a clock or a day key', () => {
    expect(journalTitleForDate(new Date(2026, 10, 17, 9, 30))).toBe('2026-11-17 日志')
    expect(journalTitleForDate('2024-05-20')).toBe('2024-05-20 日志')
  })

  it('resolves a day from the local timestamp', () => {
    const local = new Date(2026, 10, 17, 0, 5).toISOString()
    expect(localDayKeyOf(local)).toBe('2026-11-17')
    expect(localDayKeyOf('not-a-date')).toBeNull()
    expect(todayDayKey(new Date(2026, 10, 17, 23, 59))).toBe('2026-11-17')
  })

  it('finds the entry written on a day even after it was edited later', () => {
    const entries = [
      journal('written-yesterday-edited-today', new Date(2026, 10, 16, 12).toISOString(), new Date(2026, 10, 17, 9).toISOString()),
      journal('today', new Date(2026, 10, 17, 8).toISOString()),
    ]
    expect(journalForDay(entries, '2026-11-16')?.id).toBe('written-yesterday-edited-today')
    expect(journalForDay(entries, '2026-11-17')?.id).toBe('today')
    expect(journalForDay(entries, '2026-11-18')).toBeUndefined()
  })

  it('counts only entries written on the local day', () => {
    const now = new Date(2026, 10, 17, 10)
    const entries = [
      journal('today', new Date(2026, 10, 17, 0, 5).toISOString()),
      journal('yesterday-edited-today', new Date(2026, 10, 16, 23, 58).toISOString(), now.toISOString()),
      journal('broken', 'not-a-date'),
    ]
    expect(countJournalsForLocalDate(entries, now)).toBe(1)
    expect(journalDaysSet(entries)).toEqual({ '2026-11-17': true, '2026-11-16': true })
  })
})

describe('journal templates', () => {
  it('strips the generated date suffix from a promoted title', () => {
    expect(promoteTitleFromJournal('2024-05-20 日志')).toBe('')
    expect(promoteTitleFromJournal('2026-11-20 日志 复盘')).toBe('复盘')
    expect(promoteTitleFromJournal('会议记录')).toBe('会议记录')
  })

  it('labels built-in templates through the dictionary and user ones by their title', () => {
    const [first] = BUILTIN_JOURNAL_TEMPLATES
    expect(journalTemplateLabel(first!, (key) => `t:${key}`)).toBe('t:journal.template.daily')
    expect(journalTemplateLabel({ id: 'x', nameKey: null, title: '我的模板', content: first!.content }, (key) => key))
      .toBe('我的模板')
    expect(BUILTIN_JOURNAL_TEMPLATES.map((template) => template.id)).toEqual([
      'daily-review',
      'meeting-notes',
      'weekly-report',
      'project-retro',
      'book-notes',
      'personal-plan',
      'free-writing',
    ])
  })

  it('gives every built-in template a valid document body', () => {
    for (const template of BUILTIN_JOURNAL_TEMPLATES) {
      expect(isTiptapDocument(template.content), template.id).toBe(true)
      expect(template.content.content.length, template.id).toBeGreaterThan(0)
      // The cards and the journal menu render the icon; a typo would fall back
      // to the generic info glyph silently.
      expect(template.icon, template.id).not.toBe('')
    }
  })
})
