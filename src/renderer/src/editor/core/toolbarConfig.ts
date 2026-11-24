import type { EditorCommand } from './editorCommands'

/**
 * Toolbar composition, grouped the way Yuque groups it.
 *
 * Everyday actions are all visible on the bar; the folding-by-width behaviour is
 * gone, so nothing common hides behind the "more" caret any more. Only rare
 * commands (code block, focus mode) live there.
 */
export type ToolbarActionKey =
  | EditorCommand
  | 'color' | 'highlight' | 'link' | 'image' | 'table' | 'attachment' | 'task'
  | 'textStyles' | 'align' | 'list' | 'indent' | 'painter' | 'outline' | 'plus'

export interface ToolbarItem {
  key: ToolbarActionKey
  /** i18n key resolved at render time so the label follows the locale. */
  labelKey: string
  shortcut?: string
  icon: string
  command?: EditorCommand
}

/** Marks that stay one click away on the bar itself. */
export const TEXT_GROUP: readonly ToolbarItem[] = [
  { key: 'bold', labelKey: 'editor.bold', shortcut: 'Ctrl+B', icon: 'bold', command: 'bold' },
  { key: 'italic', labelKey: 'editor.italic', shortcut: 'Ctrl+I', icon: 'italic', command: 'italic' },
  { key: 'strike', labelKey: 'editor.strike', icon: 'strike', command: 'strike' },
  { key: 'underline', labelKey: 'editor.underline', shortcut: 'Ctrl+U', icon: 'underline', command: 'underline' },
]

/** Occasional marks folded under the "T" caret. */
export const TEXT_STYLE_MENU: readonly ToolbarItem[] = [
  { key: 'code', labelKey: 'editor.code', icon: 'code', command: 'code' },
  { key: 'subscript', labelKey: 'editor.subscript', icon: 'subscript', command: 'subscript' },
  { key: 'superscript', labelKey: 'editor.superscript', icon: 'superscript', command: 'superscript' },
  { key: 'link', labelKey: 'editor.link', shortcut: 'Ctrl+K', icon: 'link' },
]

export const ALIGN_ITEMS: readonly ToolbarItem[] = [
  { key: 'alignLeft', labelKey: 'editor.alignLeft', icon: 'alignLeft', command: 'alignLeft' },
  { key: 'alignCenter', labelKey: 'editor.alignCenter', icon: 'alignCenter', command: 'alignCenter' },
  { key: 'alignRight', labelKey: 'editor.alignRight', icon: 'alignRight', command: 'alignRight' },
  { key: 'alignJustify', labelKey: 'editor.alignJustify', icon: 'alignJustify', command: 'alignJustify' },
]

export const LIST_ITEMS: readonly ToolbarItem[] = [
  { key: 'bulletList', labelKey: 'editor.bulletList', icon: 'list', command: 'bulletList' },
  { key: 'orderedList', labelKey: 'editor.orderedList', icon: 'orderedList', command: 'orderedList' },
  { key: 'taskList', labelKey: 'editor.taskList', icon: 'check', command: 'taskList' },
]

export const INDENT_ITEMS: readonly ToolbarItem[] = [
  { key: 'indent', labelKey: 'editor.indent', shortcut: 'Tab', icon: 'indentIncrease', command: 'indent' },
  { key: 'outdent', labelKey: 'editor.outdent', shortcut: 'Shift+Tab', icon: 'indentDecrease', command: 'outdent' },
]

/** Block inserts: checklist, attachment, quote, divider — the compact left set. */
export const INSERT_GROUP: readonly ToolbarItem[] = [
  { key: 'task', labelKey: 'editor.insert.checklistBlock', icon: 'checkSquare', command: 'taskList' },
  { key: 'attachment', labelKey: 'editor.attachment', icon: 'attachment' },
  { key: 'blockquote', labelKey: 'editor.blockquote', icon: 'quote', command: 'blockquote' },
  { key: 'horizontalRule', labelKey: 'editor.horizontalRule', icon: 'separator', command: 'horizontalRule' },
]

/** Everything reachable from the "+" menu: blocks, media, then the rule. */
export const INSERT_MENU_ITEMS: readonly ToolbarItem[] = [
  ...INSERT_GROUP,
  { key: 'table', labelKey: 'editor.table', icon: 'table' },
  { key: 'image', labelKey: 'editor.image', icon: 'image' },
]

/** Right-hand group: view switches. Media inserts live in the "+" menu. */
export const VIEW_GROUP: readonly ToolbarItem[] = [
  { key: 'outline', labelKey: 'editor.outline.title', icon: 'outline' },
]

/** Rare commands; the only things left behind the "more" caret. */
export const MORE_TOOLBAR_ITEMS: readonly ToolbarItem[] = [
  { key: 'clearFormatting', labelKey: 'editor.clearFormatting', shortcut: 'Ctrl+\\', icon: 'x', command: 'clearFormatting' },
  { key: 'codeBlock', labelKey: 'editor.codeBlock', shortcut: 'Ctrl+Alt+C', icon: 'code', command: 'codeBlock' },
]
