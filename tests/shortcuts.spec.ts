import { describe, expect, it } from 'vitest'
import {
  bindingFromEvent,
  defaultShortcuts,
  findConflict,
  normalizeBinding,
} from '../src/renderer/src/app/shortcuts'

describe('app shortcut bindings', () => {
  it('normalizes modifier order and key case', () => {
    expect(normalizeBinding('shift+ctrl+k')).toBe('Ctrl+Shift+K')
    expect(normalizeBinding('Ctrl + Alt + [')).toBe('Ctrl+Alt+[')
    expect(normalizeBinding('cmdorctrl+n')).toBe('Ctrl+N')
    expect(normalizeBinding('')).toBe('')
  })

  it('derives a binding from a keyboard event', () => {
    expect(bindingFromEvent({ key: 'k', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe('Ctrl+K')
    expect(bindingFromEvent({ key: 'F', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe('Ctrl+Shift+F')
    // A bare modifier press must not be captured as a shortcut.
    expect(bindingFromEvent({ key: 'Shift', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false })).toBe('')
  })

  it('reports conflicts with other commands but not with itself', () => {
    const map = defaultShortcuts()
    expect(findConflict(map, 'save-now', 'Ctrl+N').conflictingId).toBe('new-document')
    expect(findConflict(map, 'new-document', 'Ctrl+N').conflictingId).toBeNull()
    expect(findConflict(map, 'save-now', 'Ctrl+Shift+P').conflictingId).toBeNull()
  })

  it('treats differently-spelled equivalent bindings as a conflict', () => {
    const map = defaultShortcuts()
    // `control+k` and `Ctrl + K` are the same physical shortcut.
    expect(findConflict(map, 'save-now', 'control+k').conflictingId).toBe('search')
    expect(findConflict(map, 'save-now', 'cmdorctrl + k').conflictingId).toBe('search')
  })
})
