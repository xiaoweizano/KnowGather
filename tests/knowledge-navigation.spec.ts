import { describe, expect, it } from 'vitest'
import type { JournalRecord } from '../src/shared/document'
import {
  countJournalsForLocalDate,
  resolveNavigationTarget,
  shouldFocusKnowledgeSearch,
} from '../src/renderer/src/app/knowledgeNavigation'

function journal(id: string, updatedAt: string): JournalRecord {
  return {
    id,
    title: id,
    content: { type: 'doc', content: [] },
    categoryId: null,
    revision: 1,
    version: 2,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  }
}

describe('knowledge navigation', () => {
  it('maps implemented navigation entries to real pages', () => {
    expect(resolveNavigationTarget('home')).toEqual({ page: 'library', implemented: true })
    expect(resolveNavigationTarget('library')).toEqual({ page: 'library', implemented: true })
    expect(resolveNavigationTarget('journal')).toEqual({ page: 'journal', implemented: true })
  })

  it('keeps unfinished navigation explicit instead of pretending to navigate', () => {
    expect(resolveNavigationTarget('assistant')).toEqual({ page: 'assistant', implemented: false })
    expect(resolveNavigationTarget('settings')).toEqual({ page: 'settings', implemented: false })
  })

  it('counts only today\'s journals using the local calendar date', () => {
    const now = new Date(2026, 10, 13, 1, 30)
    expect(countJournalsForLocalDate([
      journal('local-today', new Date(2026, 10, 13, 0, 5).toISOString()),
      journal('utc-previous-day', new Date(2026, 10, 12, 23, 58).toISOString()),
      journal('invalid', 'not-a-date'),
    ], now)).toBe(1)
  })

  it('supports Ctrl+K and Cmd+K without stealing IME composition', () => {
    expect(shouldFocusKnowledgeSearch({ key: 'k', ctrlKey: true, metaKey: false, isComposing: false })).toBe(true)
    expect(shouldFocusKnowledgeSearch({ key: 'K', ctrlKey: false, metaKey: true, isComposing: false })).toBe(true)
    expect(shouldFocusKnowledgeSearch({ key: 'k', ctrlKey: true, metaKey: false, isComposing: true })).toBe(false)
    expect(shouldFocusKnowledgeSearch({ key: 'f', ctrlKey: true, metaKey: false, isComposing: false })).toBe(false)
  })
})
