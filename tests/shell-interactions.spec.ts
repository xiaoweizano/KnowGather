import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { clampNavigationWidth, clampSidebarWidth, DEFAULT_NAVIGATION_WIDTH, DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from '../src/renderer/src/stores/ui'
import { shouldYieldShortcutToEditor } from '../src/renderer/src/app/knowledgeNavigation'
import { journalTitleForDate, formatJournalDate } from '../src/renderer/src/app/journalView'
import { plainTextPreview } from '../src/renderer/src/editor/core/markdown'
import type { TiptapDocument } from '../src/shared/document'

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

describe('resizable shell columns', () => {
  it('clamps sidebar and navigation widths to their supported ranges', () => {
    expect(clampSidebarWidth(10)).toBe(MIN_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(9999)).toBe(MAX_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(clampNavigationWidth(0)).toBe(72)
    expect(clampNavigationWidth(9999)).toBe(180)
    expect(clampNavigationWidth(Number.NaN)).toBe(DEFAULT_NAVIGATION_WIDTH)
  })

  it('drives rail and sidebar widths from the shared custom properties', () => {
    const rail = source('../src/renderer/src/components/NavigationRail.vue')
    const sidebar = source('../src/renderer/src/components/ResourceSidebar.vue')

    // Width must come from component state, not from an ancestor selector: the
    // scoped compiler drops anything after :global() and loses specificity ties.
    expect(rail).toContain('width: `${ui.navigationCollapsed ? COLLAPSED_RAIL_WIDTH : ui.navigationWidth}px`')
    expect(rail).not.toMatch(/:global\([^)]*\)\s*\./)
    expect(sidebar).toContain('width: var(--sidebar-width, 302px)')
    expect(sidebar).not.toContain('min(var(--sidebar-width')
  })

  it('does not invert the drag direction through an absent boolean prop', () => {
    const resizer = source('../src/renderer/src/components/ColumnResizer.vue')
    // An absent Boolean prop is coerced to false by Vue, which silently flipped
    // the delta for every caller that did not pass it explicitly.
    expect(resizer).not.toContain('growRight?: boolean')
    expect(resizer).toContain("props.grow !== 'left'")
  })
})

describe('focus mode and navigation collapse', () => {
  it('removes the rail and sidebar from the DOM instead of relying on ancestor CSS', () => {
    const rail = source('../src/renderer/src/components/NavigationRail.vue')
    const sidebar = source('../src/renderer/src/components/ResourceSidebar.vue')

    expect(rail).toContain('v-if="!ui.focusMode"')
    expect(sidebar).toContain('v-if="ui.sidebarVisible && !ui.focusMode"')
  })
})

describe('editor shortcut ownership', () => {
  it('lets the editor keep Ctrl+K when the keystroke starts inside the document body', () => {
    const insideEditor = { closest: (selector: string) => selector === '.shizhi-editor' ? {} : null }
    const insideSidebar = { closest: () => null }

    expect(shouldYieldShortcutToEditor(insideEditor as unknown as EventTarget)).toBe(true)
    expect(shouldYieldShortcutToEditor(insideSidebar as unknown as EventTarget)).toBe(false)
    expect(shouldYieldShortcutToEditor(null)).toBe(false)
  })
})

describe('journal page helpers', () => {
  it('names new journals after the local calendar day', () => {
    expect(journalTitleForDate(new Date(2026, 10, 17, 9, 30))).toBe('2026-11-17 日志')
  })

  it('formats journal timestamps and falls back for invalid input', () => {
    expect(formatJournalDate('2026-11-17T01:30:00.000Z')).toContain('2026')
    expect(formatJournalDate('not-a-date')).toBe('时间未知')
  })
})

describe('plain text preview', () => {
  it('flattens block content and describes non-text nodes', () => {
    const document: TiptapDocument = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '第一段' }] },
        { type: 'image', attrs: { alt: '示意图' } },
        { type: 'attachment', attrs: { name: '报告.pdf' } },
      ],
    }

    expect(plainTextPreview(document)).toBe('第一段 [图片：示意图] [附件：报告.pdf]')
  })

  it('truncates long content with an ellipsis', () => {
    const document: TiptapDocument = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(50) }] }],
    }

    expect(plainTextPreview(document, 10)).toBe(`${'x'.repeat(10)}…`)
  })
})
