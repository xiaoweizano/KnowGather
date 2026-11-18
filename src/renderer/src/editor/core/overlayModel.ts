import type { EditorCommand } from './editorCommands'
import { translate } from '../../i18n'

export type SlashAction = 'image' | 'attachment' | 'table'

export interface SlashMenuItem {
  key: string
  /** i18n key resolved when the menu renders. */
  labelKey: string
  descriptionKey: string
  icon: string
  /** Keywords in both languages so search works regardless of locale. */
  keywords: readonly string[]
  command?: EditorCommand
  action?: SlashAction
}

export const SLASH_MENU_ITEMS: readonly SlashMenuItem[] = [
  { key: 'paragraph', labelKey: 'editor.block.paragraph', descriptionKey: 'editor.slash.paragraphDesc', icon: 'edit', keywords: ['text', 'p', '正文', '段落'], command: 'paragraph' },
  { key: 'heading1', labelKey: 'editor.block.heading1', descriptionKey: 'editor.slash.heading1Desc', icon: 'heading', keywords: ['h1', 'title', 'heading', '标题'], command: 'heading1' },
  { key: 'heading2', labelKey: 'editor.block.heading2', descriptionKey: 'editor.slash.heading2Desc', icon: 'heading', keywords: ['h2', 'title', 'heading', '标题'], command: 'heading2' },
  { key: 'heading3', labelKey: 'editor.block.heading3', descriptionKey: 'editor.slash.heading3Desc', icon: 'heading', keywords: ['h3', 'title', 'heading', '标题'], command: 'heading3' },
  { key: 'bulletList', labelKey: 'editor.bulletList', descriptionKey: 'editor.slash.bulletListDesc', icon: 'list', keywords: ['list', 'ul', 'bulleted', '列表', '无序'], command: 'bulletList' },
  { key: 'orderedList', labelKey: 'editor.orderedList', descriptionKey: 'editor.slash.orderedListDesc', icon: 'orderedList', keywords: ['list', 'ol', 'numbered', '列表', '有序'], command: 'orderedList' },
  { key: 'taskList', labelKey: 'editor.taskList', descriptionKey: 'editor.slash.taskListDesc', icon: 'check', keywords: ['todo', 'task', '任务', '待办'], command: 'taskList' },
  { key: 'blockquote', labelKey: 'editor.blockquote', descriptionKey: 'editor.slash.blockquoteDesc', icon: 'quote', keywords: ['quote', '引用'], command: 'blockquote' },
  { key: 'codeBlock', labelKey: 'editor.codeBlock', descriptionKey: 'editor.slash.codeBlockDesc', icon: 'code', keywords: ['code', '代码'], command: 'codeBlock' },
  { key: 'table', labelKey: 'editor.table', descriptionKey: 'editor.slash.tableDesc', icon: 'table', keywords: ['table', '表格'], action: 'table' },
  { key: 'image', labelKey: 'editor.image', descriptionKey: 'editor.slash.imageDesc', icon: 'image', keywords: ['image', 'photo', '图片', '照片'], action: 'image' },
  { key: 'attachment', labelKey: 'editor.attachment', descriptionKey: 'editor.slash.attachmentDesc', icon: 'attachment', keywords: ['file', 'attach', '附件', '文件'], action: 'attachment' },
  { key: 'horizontalRule', labelKey: 'editor.horizontalRule', descriptionKey: 'editor.slash.horizontalRuleDesc', icon: 'separator', keywords: ['divider', 'hr', '分割线'], command: 'horizontalRule' },
]

export function slashItemLabel(item: SlashMenuItem): string {
  return translate(item.labelKey)
}

export function slashItemDescription(item: SlashMenuItem): string {
  return translate(item.descriptionKey)
}

export interface SlashTrigger {
  start: number
  query: string
}

export function detectSlashTrigger(
  textBefore: string,
  caretPosition: number,
  options: { composing?: boolean } = {},
): SlashTrigger | null {
  if (options.composing) return null
  const match = textBefore.match(/(?:^|[\s　])\/([^\s/]*)$/)
  if (!match) return null
  const query = match[1] ?? ''
  return { start: caretPosition - query.length - 1, query }
}

/**
 * Filters by the localized label, description and both-language keywords, so
 * typing `heading` or `标题` works whatever the interface language is.
 */
export function filterSlashMenuItems(query: string): SlashMenuItem[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...SLASH_MENU_ITEMS]
  return SLASH_MENU_ITEMS.filter((item) => {
    const haystack = [translate(item.labelKey), translate(item.descriptionKey), ...item.keywords]
      .join(' ')
      .toLocaleLowerCase()
    return haystack.includes(needle)
  })
}

export function moveMenuSelection(current: number, delta: number, length: number): number {
  if (length <= 0) return -1
  const next = (current + delta) % length
  return next < 0 ? next + length : next
}

export type OverlayPlacement = 'bottom-start' | 'top-start'

export interface OverlayRect {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export interface OverlayPlacementResult {
  placement: OverlayPlacement
  x: number
  y: number
}

export function resolveOverlayPlacement(
  anchor: OverlayRect,
  floating: Pick<OverlayRect, 'width' | 'height'>,
  viewport: Pick<OverlayRect, 'width' | 'height'>,
  preferred: OverlayPlacement = 'bottom-start',
  margin = 8,
): OverlayPlacementResult {
  const below = anchor.bottom + margin
  const above = anchor.top - floating.height - margin
  const fitsBelow = below + floating.height <= viewport.height - margin
  const fitsAbove = above >= margin
  const placeBelow = preferred === 'bottom-start' ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow
  const unclampedX = Math.min(anchor.left, viewport.width - floating.width - margin)
  const x = Math.max(margin, unclampedX)
  const unclampedY = placeBelow ? below : above
  const y = Math.max(margin, Math.min(unclampedY, viewport.height - floating.height - margin))
  return { placement: placeBelow ? 'bottom-start' : 'top-start', x, y }
}

export function shouldShowBubbleMenu(
  selectionEmpty: boolean,
  composing: boolean,
  editable: boolean,
): boolean {
  return !selectionEmpty && !composing && editable
}
