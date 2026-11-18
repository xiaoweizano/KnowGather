import type { EditorCommand } from './editorCommands'
import type { ToolbarLayoutItem } from './toolbarLayout'

export interface ToolbarActionItem extends ToolbarLayoutItem {
  key: EditorCommand | 'color' | 'link' | 'image' | 'table' | 'attachment'
  /** i18n key resolved at render time so the label follows the locale. */
  labelKey: string
  shortcut?: string
  icon: string
  command?: EditorCommand
  /** Toolbar actions that are display-only (fold/unfold) carry a dedicated id. */
  action?: 'foldAll' | 'unfoldAll'
}

export const PRIMARY_TOOLBAR_ITEMS: readonly ToolbarActionItem[] = [
  { key: 'bold', labelKey: 'editor.bold', shortcut: 'Ctrl+B', icon: 'bold', command: 'bold', width: 30, priority: 100 },
  { key: 'italic', labelKey: 'editor.italic', shortcut: 'Ctrl+I', icon: 'italic', command: 'italic', width: 30, priority: 95 },
  { key: 'link', labelKey: 'editor.link', shortcut: 'Ctrl+K', icon: 'link', width: 30, priority: 92 },
  { key: 'underline', labelKey: 'editor.underline', shortcut: 'Ctrl+U', icon: 'underline', command: 'underline', width: 30, priority: 90 },
  { key: 'color', labelKey: 'editor.toolbar.color', icon: 'palette', width: 32, priority: 75 },
  { key: 'highlight', labelKey: 'editor.toolbar.highlight', icon: 'separator', command: 'highlight', width: 30, priority: 72 },
  { key: 'bulletList', labelKey: 'editor.bulletList', shortcut: 'Ctrl+Shift+8', icon: 'list', command: 'bulletList', width: 30, priority: 70 },
  { key: 'taskList', labelKey: 'editor.taskList', shortcut: 'Ctrl+Shift+9', icon: 'check', command: 'taskList', width: 30, priority: 68 },
  { key: 'orderedList', labelKey: 'editor.orderedList', shortcut: 'Ctrl+Shift+7', icon: 'orderedList', command: 'orderedList', width: 30, priority: 65 },
  { key: 'code', labelKey: 'editor.code', shortcut: 'Ctrl+E', icon: 'code', command: 'code', width: 30, priority: 60 },
  { key: 'strike', labelKey: 'editor.strike', shortcut: 'Ctrl+Shift+S', icon: 'strike', command: 'strike', width: 30, priority: 55 },
  { key: 'image', labelKey: 'editor.image', icon: 'image', width: 30, priority: 50 },
  { key: 'table', labelKey: 'editor.table', icon: 'table', width: 30, priority: 48 },
  { key: 'blockquote', labelKey: 'editor.blockquote', shortcut: 'Ctrl+Shift+B', icon: 'quote', command: 'blockquote', width: 30, priority: 45 },
  { key: 'codeBlock', labelKey: 'editor.codeBlock', shortcut: 'Ctrl+Alt+C', icon: 'code', command: 'codeBlock', width: 30, priority: 40 },
  { key: 'attachment', labelKey: 'editor.attachment', icon: 'attachment', width: 30, priority: 35 },
]

export const MORE_TOOLBAR_ITEMS: readonly ToolbarActionItem[] = [
  { key: 'alignLeft', labelKey: 'editor.alignLeft', shortcut: 'Ctrl+Shift+L', icon: 'alignLeft', command: 'alignLeft', width: 160, priority: 30 },
  { key: 'alignCenter', labelKey: 'editor.alignCenter', shortcut: 'Ctrl+Shift+E', icon: 'alignCenter', command: 'alignCenter', width: 160, priority: 29 },
  { key: 'alignRight', labelKey: 'editor.alignRight', shortcut: 'Ctrl+Shift+R', icon: 'alignRight', command: 'alignRight', width: 160, priority: 28 },
  { key: 'alignJustify', labelKey: 'editor.alignJustify', icon: 'alignJustify', command: 'alignJustify', width: 160, priority: 27 },
  { key: 'indent', labelKey: 'editor.indent', shortcut: 'Tab', icon: 'chevronRight', command: 'indent', width: 160, priority: 26 },
  { key: 'outdent', labelKey: 'editor.outdent', shortcut: 'Shift+Tab', icon: 'chevronLeft', command: 'outdent', width: 160, priority: 25 },
  { key: 'horizontalRule', labelKey: 'editor.horizontalRule', shortcut: '---', icon: 'separator', command: 'horizontalRule', width: 160, priority: 20 },
  { key: 'clearFormatting', labelKey: 'editor.clearFormatting', shortcut: 'Ctrl+\\', icon: 'x', command: 'clearFormatting', width: 160, priority: 15 },
]

export const TEXT_COLORS = [
  { labelKey: 'editor.color.default', value: null },
  { labelKey: 'editor.color.violet', value: '#6654dc' },
  { labelKey: 'editor.color.blue', value: '#3278c7' },
  { labelKey: 'editor.color.green', value: '#2b8a64' },
  { labelKey: 'editor.color.orange', value: '#c56a2d' },
  { labelKey: 'editor.color.red', value: '#c84b55' },
  { labelKey: 'editor.color.gray', value: '#6f6a79' },
] as const

export const HIGHLIGHT_COLORS = [
  { labelKey: 'editor.highlight.none', value: null },
  { labelKey: 'editor.highlight.softViolet', value: '#e7e1ff' },
  { labelKey: 'editor.highlight.paleYellow', value: '#fff0a8' },
  { labelKey: 'editor.highlight.lightBlue', value: '#dceeff' },
  { labelKey: 'editor.highlight.mint', value: '#dff4e8' },
  { labelKey: 'editor.highlight.apricot', value: '#ffe4cf' },
  { labelKey: 'editor.highlight.softPink', value: '#ffdce5' },
] as const
