import type { Editor } from '@tiptap/core'
import { translate } from '../../i18n'

export type EditorCommand =
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'highlight'
  | 'subscript' | 'superscript'
  | 'blockquote' | 'bulletList' | 'orderedList' | 'taskList' | 'codeBlock' | 'horizontalRule'
  | 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignJustify'
  | 'indent' | 'outdent' | 'clearFormatting' | 'undo' | 'redo'

const HEADING_LEVELS: Record<string, number> = {
  heading1: 1, heading2: 2, heading3: 3, heading4: 4, heading5: 5, heading6: 6,
}

export function runEditorCommand(editor: Editor, command: EditorCommand): boolean {
  switch (command) {
    case 'paragraph': return editor.chain().setParagraph().run()
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'heading4':
    case 'heading5':
    case 'heading6':
      return editor.chain().setHeading({ level: HEADING_LEVELS[command] as 1 | 2 | 3 | 4 | 5 | 6 }).run()
    case 'bold': return editor.chain().toggleBold().run()
    case 'italic': return editor.chain().toggleItalic().run()
    case 'underline': return editor.chain().toggleUnderline().run()
    case 'strike': return editor.chain().toggleStrike().run()
    case 'code': return editor.chain().toggleCode().run()
    case 'highlight': return editor.chain().toggleHighlight({ color: '#fff0a8' }).run()
    case 'subscript': return editor.chain().toggleMark('subscript').run()
    case 'superscript': return editor.chain().toggleMark('superscript').run()
    case 'blockquote': return editor.chain().toggleBlockquote().run()
    case 'bulletList': return editor.chain().toggleBulletList().run()
    case 'orderedList': return editor.chain().toggleOrderedList().run()
    case 'taskList': return editor.chain().toggleTaskList().run()
    case 'codeBlock': return editor.chain().toggleCodeBlock().run()
    case 'horizontalRule': return editor.chain().setHorizontalRule().run()
    case 'alignLeft': return editor.chain().setTextAlign('left').run()
    case 'alignCenter': return editor.chain().setTextAlign('center').run()
    case 'alignRight': return editor.chain().setTextAlign('right').run()
    case 'alignJustify': return editor.chain().setTextAlign('justify').run()
    case 'indent':
      return editor.chain().sinkListItem('listItem').run()
        || editor.chain().sinkListItem('taskItem').run()
    case 'outdent':
      return editor.chain().liftListItem('listItem').run()
        || editor.chain().liftListItem('taskItem').run()
    case 'clearFormatting': return editor.chain().unsetAllMarks().clearNodes().run()
    case 'undo': return editor.chain().undo().run()
    case 'redo': return editor.chain().redo().run()
  }
}

export interface LinkRange {
  from: number
  to: number
}

/** Bare hosts become https links, the way the browser address bar treats them. */
export function normalizeLinkHref(raw: string): string {
  const href = raw.trim()
  if (!href) return ''
  return /^(https?:|mailto:|#|\/)/i.test(href) ? href : `https://${href}`
}

/**
 * The whole link under the selection, so the floating link toolbar can anchor
 * to the full label instead of a collapsed caret inside it.
 */
export function getActiveLinkRange(editor: Editor): LinkRange | null {
  const { state } = editor
  const linkType = state.schema.marks.link
  if (!linkType) return null
  const { from, to, empty } = state.selection
  if (!empty) return state.doc.rangeHasMark(from, to, linkType) ? { from, to } : null

  const $from = state.doc.resolve(from)
  const parent = $from.parent
  const parentStart = from - $from.parentOffset
  const segments: Array<LinkRange & { href: unknown }> = []
  parent.forEach((node, offset) => {
    if (!node.isText) return
    const mark = linkType.isInSet(node.marks)
    if (!mark) return
    const start = parentStart + offset
    segments.push({ from: start, to: start + node.nodeSize, href: mark.attrs.href })
  })

  const hit = segments.find((segment) => from >= segment.from && from <= segment.to)
  if (!hit) return null
  let start = hit.from
  let end = hit.to
  let extended = true
  // A link can be split across inline nodes when part of it carries other
  // marks, so grow the range over same-href neighbours.
  while (extended) {
    extended = false
    for (const segment of segments) {
      if (segment.href !== hit.href) continue
      if (segment.to === start) {
        start = segment.from
        extended = true
      } else if (segment.from === end) {
        end = segment.to
        extended = true
      }
    }
  }
  return { from: start, to: end }
}

/**
 * Applies the floating card's two fields. The label replaces the selection
 * (or is inserted at the caret) and carries the link mark; clearing the href
 * removes the link without touching the text.
 */
export function applyEditorLink(editor: Editor, text: string, rawHref: string): boolean {
  const href = normalizeLinkHref(rawHref)
  if (editor.isActive('link')) editor.chain().extendMarkRange('link').run()
  if (!href) return editor.chain().extendMarkRange('link').unsetLink().run()

  const linkType = editor.state.schema.marks.link
  if (!linkType) return false
  const label = text.trim() || href
  const mark = linkType.create({ href })
  const { state } = editor
  const { from, to } = state.selection
  const { tr } = state
  const end = from + label.length
  tr.insertText(label, from, to)
  tr.addMark(from, end, mark)
  // Keep the caret "inside" the new link so the next edit extends it and the
  // toolbar can read its href straight from the selection.
  tr.setStoredMarks([mark])
  editor.view.dispatch(tr)
  editor.commands.focus()
  return true
}

export function setEditorTextColor(editor: Editor, color: string | null): boolean {
  return color
    ? editor.chain().setColor(color).run()
    : editor.chain().unsetColor().run()
}

export function setEditorHighlight(editor: Editor, color: string | null): boolean {
  return color
    ? editor.chain().setHighlight({ color }).run()
    : editor.chain().unsetHighlight().run()
}

/** Font sizes map onto the text style mark, so they compose with colours. */
export function setEditorFontSize(editor: Editor, size: string | null): boolean {
  return size
    ? editor.chain().setFontSize(size).run()
    : editor.chain().unsetFontSize().run()
}

/** The size the selection currently carries, if any, as a CSS value. */
export function currentEditorFontSize(editor: Editor): string | null {
  const value = editor.getAttributes('textStyle').fontSize
  return typeof value === 'string' && value ? value : null
}

export interface FormatSnapshot {
  /** Inline marks captured at the caret or selection. */
  marks: Array<{ type: string; attrs: Record<string, unknown> }>
  /** Block style, limited to what the format painter restores. */
  block: { type: 'paragraph' | 'heading'; level?: number; textAlign?: string | null } | null
}

/**
 * Copies the formatting at the selection so the format painter can replay it
 * elsewhere. Marks come from the stored marks first (a caret just after typing
 * inherits them) and fall back to the marks under the selection start.
 */
export function captureFormatSnapshot(editor: Editor): FormatSnapshot {
  const { $from, from, to } = editor.state.selection
  const source = editor.state.storedMarks ?? (from === to
    ? $from.marks()
    : editor.state.doc.resolve(from).marksAcross(editor.state.doc.resolve(to)) ?? $from.marks())
  const marks = (source ?? [])
    .filter((mark) => mark.type.name !== 'link')
    .map((mark) => ({ type: mark.type.name, attrs: { ...mark.attrs } }))

  const parent = $from.parent
  const block = parent.type.name === 'heading'
    ? { type: 'heading' as const, level: Number(parent.attrs.level ?? 1), textAlign: (parent.attrs.textAlign as string | null) ?? null }
    : { type: 'paragraph' as const, textAlign: (parent.attrs.textAlign as string | null) ?? null }

  return { marks, block }
}

/** Applies a captured snapshot to the current selection or caret. */
export function applyFormatSnapshot(editor: Editor, snapshot: FormatSnapshot): boolean {
  let chain = editor.chain().focus()
  if (snapshot.block) {
    chain = snapshot.block.type === 'heading'
      ? chain.setHeading({ level: (snapshot.block.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 })
      : chain.setParagraph()
    chain = snapshot.block.textAlign
      ? chain.setTextAlign(snapshot.block.textAlign)
      : chain.unsetTextAlign()
  }
  chain = chain.unsetAllMarks()
  for (const mark of snapshot.marks) {
    chain = mark.type === 'textStyle'
      ? chain.setMark('textStyle', mark.attrs)
      : chain.setMark(mark.type, mark.attrs)
  }
  return chain.run()
}

export function isEditorCommandActive(editor: Editor, command: EditorCommand): boolean {
  switch (command) {
    case 'paragraph': return editor.isActive('paragraph') && !editor.isActive('blockquote')
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'heading4':
    case 'heading5':
    case 'heading6':
      return editor.isActive('heading', { level: HEADING_LEVELS[command] })
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
    case 'code':
    case 'highlight':
    case 'subscript':
    case 'superscript':
    case 'blockquote':
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
    case 'codeBlock':
      return editor.isActive(command)
    case 'alignLeft':
    case 'alignCenter':
    case 'alignRight':
    case 'alignJustify': {
      const align = command.slice(5).toLowerCase()
      return editor.isActive({ textAlign: align })
    }
    default:
      return false
  }
}

export function canRunEditorCommand(editor: Editor, command: EditorCommand): boolean {
  switch (command) {
    case 'undo': return editor.can().undo()
    case 'redo': return editor.can().redo()
    case 'indent': return editor.can().sinkListItem('listItem') || editor.can().sinkListItem('taskItem')
    case 'outdent': return editor.can().liftListItem('listItem') || editor.can().liftListItem('taskItem')
    default: return editor.isEditable
  }
}

export function getActiveBlockLabel(editor: Editor): string {
  for (const level of [1, 2, 3, 4, 5, 6]) {
    if (editor.isActive('heading', { level })) return translate(`editor.block.heading${level}`)
  }
  return translate('editor.block.paragraph')
}
