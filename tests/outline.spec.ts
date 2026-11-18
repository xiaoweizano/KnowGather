import { describe, expect, it } from 'vitest'
import {
  activeHeadingIndex,
  collectOutline,
  nodeSize,
} from '../src/renderer/src/app/outline'
import {
  buildHeatmap,
  heatLevel,
  computeStreak,
  countThisWeek,
  heatLegend,
} from '../src/renderer/src/app/heatmap'
import { localDayKey, type ActivityDay } from '../src/shared/settings'
import type { TiptapDocument } from '../src/shared/document'

function doc(content: TiptapDocument['content']): TiptapDocument {
  return { type: 'doc', content }
}

describe('outline collection', () => {
  it('collects H1–H3 with ProseMirror positions', () => {
    const outline = collectOutline(doc([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '项目' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '背景' }] },
    ]))

    expect(outline.map((item) => ({ level: item.level, text: item.text }))).toEqual([
      { level: 1, text: '项目' },
      { level: 2, text: '背景' },
    ])
    // `项目` is 2 characters, so heading 1 occupies 2+2 = 4 and the paragraph
    // starts at 4; `正文` is 2 more, so the second heading starts at 8.
    expect(outline[0]!.pos).toBe(0)
    expect(outline[1]!.pos).toBe(8)
  })

  it('skips levels outside 1–3 and empty headings still appear', () => {
    const outline = collectOutline(doc([
      { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: '四级' }] },
      { type: 'heading', attrs: { level: 3 } },
    ]))

    expect(outline).toHaveLength(1)
    expect(outline[0]).toMatchObject({ level: 3, text: '' })
  })

  it('finds headings nested inside blockquotes', () => {
    const outline = collectOutline(doc([
      { type: 'blockquote', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '引用中的标题' }] },
      ] },
    ]))

    expect(outline[0]!.text).toBe('引用中的标题')
  })

  it('carries the current position to the active heading', () => {
    const outline = collectOutline(doc([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'B' }] },
    ]))

    expect(activeHeadingIndex(outline, 0)).toBe(0)
    expect(activeHeadingIndex(outline, 2)).toBe(0)
    expect(activeHeadingIndex(outline, outline[1]!.pos + 1)).toBe(1)
  })

  it('computes node sizes the same way ProseMirror does', () => {
    expect(nodeSize({ type: 'text', text: 'abcd' })).toBe(4)
    expect(nodeSize({ type: 'horizontalRule' })).toBe(1)
    expect(nodeSize({ type: 'paragraph', content: [{ type: 'text', text: 'ab' }] })).toBe(4)
    // listItem: paragraph(1 char → 3) + 2 = 5; bulletList: 5 + 2 = 7.
    expect(nodeSize({ type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
    ] })).toBe(7)
  })
})

function days(entries: Record<string, number>): Record<string, ActivityDay> {
  return Object.fromEntries(
    Object.entries(entries).map(([key, edits]) => [key, { edits, journals: 0, characters: 0 }]),
  )
}

describe('activity heatmap', () => {
  const today = new Date(2026, 10, 13, 15, 0) // Friday

  it('renders one cell per day and aligns rows to weekdays', () => {
    const model = buildHeatmap(days({ [localDayKey(today)]: 2 }), today, 4)

    expect(model.weeks).toHaveLength(4)
    for (const week of model.weeks) expect(week.cells).toHaveLength(7)
    const lastWeek = model.weeks.at(-1)!
    expect(lastWeek.cells[5]!.key).toBe(localDayKey(today))
    // Days after today in the final week are padding cells.
    expect(lastWeek.cells[6]!.date).toBeNull()
    expect(lastWeek.cells[6]!.key).toBe('')
  })

  it('scales levels against the busiest day', () => {
    expect(heatLevel(0)).toBe(0)
    expect(heatLevel(1, 8)).toBe(1)
    expect(heatLevel(4, 8)).toBe(2)
    expect(heatLevel(6, 8)).toBe(3)
    expect(heatLevel(8, 8)).toBe(4)
    expect(heatLevel(3, 1)).toBe(1)
  })

  it('counts totals, active days and the running streak', () => {
    const yesterday = new Date(2026, 10, 12)
    const twoDaysAgo = new Date(2026, 10, 11)
    const payload = days({
      [localDayKey(today)]: 3,
      [localDayKey(yesterday)]: 1,
      [localDayKey(twoDaysAgo)]: 4,
    })
    const model = buildHeatmap(payload, today, 8)

    expect(model.totalEdits).toBe(8)
    expect(model.activeDays).toBe(3)
    expect(model.streak).toBe(3)
    // 2026-11-13 is a Friday, so the week starts on Sunday the 8th and all
    // three recorded days fall inside it.
    expect(model.thisWeek).toBe(8)
    expect(model.max).toBe(4)
  })

  it('keeps a streak alive when today has no edits yet', () => {
    const yesterday = new Date(2026, 10, 12)
    const active = new Map([[localDayKey(yesterday), 1]])

    expect(computeStreak(active, today)).toBe(1)
  })

  it('counts only the current calendar week', () => {
    const sunday = new Date(2026, 10, 8)
    const active = new Map([
      [localDayKey(sunday), 2],
      [localDayKey(new Date(2026, 10, 13)), 5],
      [localDayKey(new Date(2026, 10, 1)), 9],
    ])

    expect(countThisWeek(active, today)).toBe(7)
  })

  it('builds a five-step legend', () => {
    expect(heatLegend(8).map((entry) => entry.level)).toEqual([0, 1, 2, 3, 4])
    expect(heatLegend(8)[4]!.count).toBe(8)
  })
})
