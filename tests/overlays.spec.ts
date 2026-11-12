import { describe, expect, it } from 'vitest'
import {
  detectSlashTrigger,
  filterSlashMenuItems,
  moveMenuSelection,
  resolveOverlayPlacement,
  shouldShowBubbleMenu,
} from '../src/renderer/src/editor/core/overlayModel'

describe('slash menu model', () => {
  it('detects and filters an anchored slash query', () => {
    const trigger = detectSlashTrigger('正文 /标', 5)
    expect(trigger).toEqual({ start: 3, query: '标' })
    expect(filterSlashMenuItems('标题').map((item) => item.key)).toEqual([
      'heading1',
      'heading2',
      'heading3',
    ])
    expect(filterSlashMenuItems('task').map((item) => item.key)).toContain('taskList')
  })

  it('does not open slash syntax inside a URL or during composition', () => {
    expect(detectSlashTrigger('https:/', 7)).toBeNull()
    expect(detectSlashTrigger('正文 /标', 5, { composing: true })).toBeNull()
  })

  it('wraps keyboard selection in both directions', () => {
    expect(moveMenuSelection(0, -1, 3)).toBe(2)
    expect(moveMenuSelection(2, 1, 3)).toBe(0)
    expect(moveMenuSelection(0, 1, 0)).toBe(-1)
  })
})

describe('overlay geometry', () => {
  const viewport = { width: 800, height: 600 }

  it('flips above when the caret is near the viewport bottom', () => {
    const result = resolveOverlayPlacement(
      { top: 540, bottom: 560, left: 300, right: 301, width: 1, height: 20 },
      { width: 240, height: 180 },
      viewport,
    )
    expect(result.placement).toBe('top-start')
    expect(result.y).toBeGreaterThanOrEqual(8)
    expect(result.y + 180).toBeLessThan(540)
  })

  it('shifts horizontally to stay inside narrow viewports', () => {
    const result = resolveOverlayPlacement(
      { top: 100, bottom: 120, left: 620, right: 621, width: 1, height: 20 },
      { width: 260, height: 100 },
      viewport,
    )
    expect(result.x + 260).toBeLessThanOrEqual(792)
  })

  it('shows the bubble menu only for editable, non-composing selections', () => {
    expect(shouldShowBubbleMenu(false, false, true)).toBe(true)
    expect(shouldShowBubbleMenu(true, false, true)).toBe(false)
    expect(shouldShowBubbleMenu(false, true, true)).toBe(false)
    expect(shouldShowBubbleMenu(false, false, false)).toBe(false)
  })

  it('keeps overlays reachable after a short viewport or long-document scroll', () => {
    const result = resolveOverlayPlacement(
      { top: 4200, bottom: 4220, left: 410, right: 411, width: 1, height: 20 },
      { width: 300, height: 240 },
      { width: 320, height: 240 },
    )

    expect(result.placement).toBe('top-start')
    expect(result.x).toBeGreaterThanOrEqual(8)
    expect(result.y).toBe(8)
    expect(result.x + 300).toBeLessThanOrEqual(320)
    expect(result.y).toBeLessThan(240)
  })
})
