import { ref } from 'vue'

export interface ShortcutDefinition {
  id: AppCommandId
  /** i18n key for the command name. */
  labelKey: string
  defaultBinding: string
  group: 'app' | 'editor'
  /** Editor shortcuts are shown for reference but cannot be rebound. */
  editable: boolean
}

export type AppCommandId =
  | 'new-document'
  | 'search'
  | 'focus-mode'
  | 'toggle-theme'
  | 'open-settings'
  | 'save-now'
  | 'fold-all'
  | 'unfold-all'

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  { id: 'new-document', labelKey: 'shortcuts.newDocument', defaultBinding: 'Ctrl+N', group: 'app', editable: true },
  { id: 'search', labelKey: 'shortcuts.search', defaultBinding: 'Ctrl+K', group: 'app', editable: true },
  { id: 'focus-mode', labelKey: 'shortcuts.focusMode', defaultBinding: 'Ctrl+Shift+F', group: 'app', editable: true },
  { id: 'toggle-theme', labelKey: 'shortcuts.toggleTheme', defaultBinding: 'Ctrl+Shift+T', group: 'app', editable: true },
  { id: 'open-settings', labelKey: 'shortcuts.openSettings', defaultBinding: 'Ctrl+,', group: 'app', editable: true },
  { id: 'save-now', labelKey: 'shortcuts.save', defaultBinding: 'Ctrl+S', group: 'app', editable: true },
  { id: 'fold-all', labelKey: 'shortcuts.foldAll', defaultBinding: 'Ctrl+Alt+[', group: 'app', editable: true },
  { id: 'unfold-all', labelKey: 'shortcuts.unfoldAll', defaultBinding: 'Ctrl+Alt+]', group: 'app', editable: true },
]

/** Reference list of editor-owned shortcuts; Tiptap owns these and they are fixed. */
export const EDITOR_SHORTCUTS: ReadonlyArray<{ labelKey: string; binding: string }> = [
  { labelKey: 'shortcuts.bold', binding: 'Ctrl+B' },
  { labelKey: 'shortcuts.italic', binding: 'Ctrl+I' },
  { labelKey: 'shortcuts.underline', binding: 'Ctrl+U' },
  { labelKey: 'shortcuts.inlineCode', binding: 'Ctrl+E' },
  { labelKey: 'shortcuts.insertLink', binding: 'Ctrl+K' },
  { labelKey: 'shortcuts.headings', binding: 'Ctrl+Alt+1/2/3' },
  { labelKey: 'shortcuts.bulletList', binding: 'Ctrl+Shift+8' },
  { labelKey: 'shortcuts.orderedList', binding: 'Ctrl+Shift+7' },
  { labelKey: 'shortcuts.taskList', binding: 'Ctrl+Shift+9' },
  { labelKey: 'shortcuts.undo', binding: 'Ctrl+Z' },
  { labelKey: 'shortcuts.redo', binding: 'Ctrl+Shift+Z' },
  { labelKey: 'shortcuts.indent', binding: 'Tab / Shift+Tab' },
]

export type ShortcutMap = Record<AppCommandId, string>

const STORAGE_KEY = 'shizhi.shortcuts'

export function defaultShortcuts(): ShortcutMap {
  return Object.fromEntries(
    SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition.defaultBinding]),
  ) as ShortcutMap
}

export function readShortcuts(): ShortcutMap {
  const defaults = defaultShortcuts()
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Record<AppCommandId, unknown>>
    const next = { ...defaults }
    for (const definition of SHORTCUT_DEFINITIONS) {
      const value = parsed[definition.id]
      if (typeof value === 'string' && value.trim()) next[definition.id] = normalizeBinding(value)
    }
    return next
  } catch {
    return defaults
  }
}

export function writeShortcuts(map: ShortcutMap): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Shortcut persistence is a convenience; failing must not break the app.
  }
}

/** Canonical form: modifiers in Ctrl/Alt/Shift/Meta order, key uppercased. */
export function normalizeBinding(binding: string): string {
  const parts = binding.split('+').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return ''
  const key = parts.pop() ?? ''
  const modifiers: string[] = []
  const lowered = parts.map((part) => part.toLowerCase())
  if (lowered.includes('ctrl') || lowered.includes('control') || lowered.includes('cmdorctrl')) modifiers.push('Ctrl')
  if (lowered.includes('alt') || lowered.includes('option')) modifiers.push('Alt')
  if (lowered.includes('shift')) modifiers.push('Shift')
  if (lowered.includes('meta') || lowered.includes('cmd') || lowered.includes('command')) modifiers.push('Meta')
  return [...modifiers, normalizeKey(key)].join('+')
}

function normalizeKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length === 1) return trimmed.toUpperCase()
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

/** Converts a keyboard event into the same canonical form as `normalizeBinding`. */
export function bindingFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string {
  const key = event.key
  if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return ''
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  parts.push(normalizeKey(key === ' ' ? 'Space' : key))
  return parts.join('+')
}

export interface ShortcutConflict {
  conflictingId: AppCommandId | null
}

/**
 * Checks whether a binding is already used by another command. Editor-level
 * bindings are not part of the map and therefore never conflict here; the UI
 * documents that they are fixed.
 */
export function findConflict(map: ShortcutMap, id: AppCommandId, binding: string): ShortcutConflict {
  const normalized = normalizeBinding(binding)
  // Compare canonicalized forms on both sides so `shift+ctrl+k` still collides
  // with the stored `Ctrl+Shift+K`.
  const match = (Object.entries(map) as Array<[AppCommandId, string]>)
    .find(([otherId, value]) => otherId !== id && normalizeBinding(value) === normalized)
  return { conflictingId: match ? match[0] : null }
}

export function shortcutLabelKey(id: AppCommandId): string {
  return SHORTCUT_DEFINITIONS.find((definition) => definition.id === id)?.labelKey ?? id
}

/**
 * Global state for the shortcut capture dialog. Kept in a module-level ref so
 * the settings page and the window-level handler agree on one source.
 */
export const shortcutCaptureActive = ref(false)
