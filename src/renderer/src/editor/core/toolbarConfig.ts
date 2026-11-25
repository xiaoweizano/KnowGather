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
  | 'color' | 'highlight' | 'link' | 'image' | 'table' | 'attachment'
  | 'textStyles' | 'align' | 'list' | 'indent' | 'painter' | 'outline' | 'plus'
  | 'math' | 'diagram' | 'callout' | 'toggle' | 'columns' | 'emoji'

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
  { key: 'taskList', labelKey: 'editor.taskList', icon: 'checkSquare', command: 'taskList' },
]

export const INDENT_ITEMS: readonly ToolbarItem[] = [
  { key: 'indent', labelKey: 'editor.indent', shortcut: 'Tab', icon: 'indentIncrease', command: 'indent' },
  { key: 'outdent', labelKey: 'editor.outdent', shortcut: 'Shift+Tab', icon: 'indentDecrease', command: 'outdent' },
]

/** Line heights offered by the toolbar; a plain block follows the settings. */
export { LINE_HEIGHTS as LINE_HEIGHT_OPTIONS } from '../extensions/blockFormat'

/** Block inserts that do not already have their own button on the bar. */
export const INSERT_GROUP: readonly ToolbarItem[] = [
  { key: 'blockquote', labelKey: 'editor.blockquote', icon: 'quote', command: 'blockquote' },
  { key: 'horizontalRule', labelKey: 'editor.horizontalRule', icon: 'separator', command: 'horizontalRule' },
]

/**
 * Everything reachable from the "+" menu: media, then the rich blocks.
 *
 * The checklist is not here on purpose: it already has its own button on the
 * bar, and listing it twice read as two different features.
 */
export const INSERT_MENU_ITEMS: readonly ToolbarItem[] = [
  { key: 'attachment', labelKey: 'editor.attachment', icon: 'attachment' },
  { key: 'table', labelKey: 'editor.table', icon: 'table' },
  { key: 'image', labelKey: 'editor.image', icon: 'image' },
  { key: 'codeBlock', labelKey: 'editor.codeBlock', icon: 'code', command: 'codeBlock' },
  { key: 'math', labelKey: 'editor.math', icon: 'math' },
  { key: 'diagram', labelKey: 'editor.diagram', icon: 'diagram' },
  { key: 'callout', labelKey: 'editor.callout', icon: 'callout' },
  { key: 'toggle', labelKey: 'editor.toggle', icon: 'toggle' },
  { key: 'columns', labelKey: 'editor.columns', icon: 'columns' },
  { key: 'emoji', labelKey: 'editor.emoji', icon: 'smile' },
]

/** Right-hand group: view switches. Media inserts live in the "+" menu. */
export const VIEW_GROUP: readonly ToolbarItem[] = [
  { key: 'outline', labelKey: 'editor.outline.title', icon: 'outline' },
]

/** Rare commands; the only things left behind the "more" caret. */
export const MORE_TOOLBAR_ITEMS: readonly ToolbarItem[] = [
  { key: 'clearFormatting', labelKey: 'editor.clearFormatting', shortcut: 'Ctrl+\\', icon: 'x', command: 'clearFormatting' },
]
