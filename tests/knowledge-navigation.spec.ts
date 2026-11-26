import { describe, expect, it } from 'vitest'
import type { JournalRecord } from '../src/shared/document'
import {
  countJournalsForLocalDate,
  journalStreak,
  journalsForLocalDate,
  resolveNavigationTarget,
  shouldFocusKnowledgeSearch,
} from '../src/renderer/src/app/knowledgeNavigation'

function journal(
  id: string,
  updatedAt: string,
  content: JournalRecord['content'] = { type: 'doc', content: [] },
): JournalRecord {
  return {
    id,
    title: id,
    content,
    categoryId: null,
    revision: 1,
    version: 2,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  }
}

describe('knowledge navigation', () => {
  it('maps every navigation entry to a real page', () => {
    expect(resolveNavigationTarget('home')).toEqual({ page: 'home', implemented: true })
    expect(resolveNavigationTarget('library')).toEqual({ page: 'library', implemented: true })
    expect(resolveNavigationTarget('journal')).toEqual({ page: 'journal', implemented: true })
    expect(resolveNavigationTarget('settings')).toEqual({ page: 'settings', implemented: true })
    expect(resolveNavigationTarget('assistant')).toEqual({ page: 'assistant', implemented: true })
  })

  it('counts only today\'s journals using the local calendar date', () => {
    const now = new Date(2026, 10, 13, 1, 30)
    expect(countJournalsForLocalDate([
      journal('local-today', new Date(2026, 10, 13, 0, 5).toISOString()),
      journal('utc-previous-day', new Date(2026, 10, 12, 23, 58).toISOString()),
      journal('invalid', 'not-a-date'),
    ], now)).toBe(1)
  })

  it('returns the entries of a day so the rail can total their characters', () => {
    const now = new Date(2026, 10, 13, 1, 30)
    const entries = journalsForLocalDate([
      journal('local-today', new Date(2026, 10, 13, 0, 5).toISOString()),
      journal('utc-previous-day', new Date(2026, 10, 12, 23, 58).toISOString()),
    ], now)

    expect(entries.map((entry) => entry.id)).toEqual(['local-today'])
  })

  it('counts a journal streak back from today and tolerates an empty today', () => {
    const now = new Date(2026, 10, 13, 15, 0)
    const streak = (...days: Array<[string, Date]>): number => journalStreak(
      days.map(([id, date]) => journal(id, date.toISOString())),
      now,
    )

    expect(streak(
      ['today', new Date(2026, 10, 13, 9, 0)],
      ['yesterday', new Date(2026, 10, 12, 9, 0)],
      ['two-days-ago', new Date(2026, 10, 11, 9, 0)],
    )).toBe(3)
    // The day is not over yet, so an empty today keeps yesterday's run alive.
    expect(streak(
      ['yesterday', new Date(2026, 10, 12, 9, 0)],
      ['two-days-ago', new Date(2026, 10, 11, 9, 0)],
    )).toBe(2)
    // A gap breaks the run.
    expect(streak(
      ['today', new Date(2026, 10, 13, 9, 0)],
      ['three-days-ago', new Date(2026, 10, 10, 9, 0)],
    )).toBe(1)
    expect(streak()).toBe(0)
  })

  it('supports Ctrl+K and Cmd+K without stealing IME composition', () => {
    expect(shouldFocusKnowledgeSearch({ key: 'k', ctrlKey: true, metaKey: false, isComposing: false })).toBe(true)
    expect(shouldFocusKnowledgeSearch({ key: 'K', ctrlKey: false, metaKey: true, isComposing: false })).toBe(true)
    expect(shouldFocusKnowledgeSearch({ key: 'k', ctrlKey: true, metaKey: false, isComposing: true })).toBe(false)
    expect(shouldFocusKnowledgeSearch({ key: 'f', ctrlKey: true, metaKey: false, isComposing: false })).toBe(false)
  })
})
