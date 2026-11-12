import type { EditorCommand } from './editorCommands'

export type SlashAction = 'image' | 'attachment' | 'table'

export interface SlashMenuItem {
  key: string
  label: string
  description: string
  icon: string
  keywords: readonly string[]
  command?: EditorCommand
  action?: SlashAction
}

export const SLASH_MENU_ITEMS: readonly SlashMenuItem[] = [
  { key: 'paragraph', label: '正文', description: '普通文本段落', icon: 'edit', keywords: ['text', 'p', '正文', '段落'], command: 'paragraph' },
  { key: 'heading1', label: '标题 1', description: '一级章节标题', icon: 'heading', keywords: ['h1', 'title', '标题'], command: 'heading1' },
  { key: 'heading2', label: '标题 2', description: '二级章节标题', icon: 'heading', keywords: ['h2', 'title', '标题'], command: 'heading2' },
  { key: 'heading3', label: '标题 3', description: '三级章节标题', icon: 'heading', keywords: ['h3', 'title', '标题'], command: 'heading3' },
  { key: 'bulletList', label: '无序列表', description: '创建项目符号列表', icon: 'list', keywords: ['list', 'ul', '列表', '无序'], command: 'bulletList' },
  { key: 'orderedList', label: '有序列表', description: '创建编号列表', icon: 'orderedList', keywords: ['list', 'ol', '列表', '有序'], command: 'orderedList' },
  { key: 'taskList', label: '任务列表', description: '创建可勾选任务', icon: 'check', keywords: ['todo', 'task', '任务', '待办'], command: 'taskList' },
  { key: 'blockquote', label: '引用', description: '插入引用段落', icon: 'quote', keywords: ['quote', '引用'], command: 'blockquote' },
  { key: 'codeBlock', label: '代码块', description: '插入等宽代码区域', icon: 'code', keywords: ['code', '代码'], command: 'codeBlock' },
  { key: 'table', label: '表格', description: '插入 3 × 3 表格', icon: 'table', keywords: ['table', '表格'], action: 'table' },
  { key: 'image', label: '图片', description: '从本地插入图片', icon: 'image', keywords: ['image', 'photo', '图片', '照片'], action: 'image' },
  { key: 'attachment', label: '附件', description: '添加本地文件引用', icon: 'attachment', keywords: ['file', '附件', '文件'], action: 'attachment' },
  { key: 'horizontalRule', label: '分割线', description: '插入内容分隔线', icon: 'separator', keywords: ['divider', 'hr', '分割线'], command: 'horizontalRule' },
]

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
  const match = textBefore.match(/(?:^|[\s\u3000])\/([^\s/]*)$/)
  if (!match) return null
  const query = match[1] ?? ''
  return { start: caretPosition - query.length - 1, query }
}

export function filterSlashMenuItems(query: string): SlashMenuItem[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...SLASH_MENU_ITEMS]
  return SLASH_MENU_ITEMS.filter((item) => {
    const haystack = [item.label, item.description, ...item.keywords]
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
