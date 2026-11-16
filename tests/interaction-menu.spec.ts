import { describe, expect, it } from 'vitest'
import { shouldDismissLayer } from '../src/renderer/src/composables/dismissibleLayer'

function targetWithAncestor(inside: boolean): EventTarget {
  const ancestor = { contains: (node: unknown) => inside && node === child }
  const child = { closest: (selector: string) => selector === '.menu-layer' ? ancestor : null }
  return child as unknown as EventTarget
}

describe('dismissible interaction layers', () => {
  it('closes on Escape even when focus remains inside the layer', () => {
    expect(shouldDismissLayer({ type: 'keydown', key: 'Escape' }, targetWithAncestor(true), '.menu-layer')).toBe(true)
    expect(shouldDismissLayer({ type: 'keydown', key: 'Enter' }, targetWithAncestor(true), '.menu-layer')).toBe(false)
  })

  it('keeps pointer events inside the layer and dismisses outside pointer presses', () => {
    expect(shouldDismissLayer({ type: 'pointerdown' }, targetWithAncestor(true), '.menu-layer')).toBe(false)
    expect(shouldDismissLayer({ type: 'pointerdown' }, targetWithAncestor(false), '.menu-layer')).toBe(true)
  })
})
