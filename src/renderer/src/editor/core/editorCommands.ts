import type { Editor } from '@tiptap/core'

export type EditorCommand =
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'highlight'
  | 'blockquote' | 'bulletList' | 'orderedList' | 'taskList' | 'codeBlock' | 'horizontalRule'
  | 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignJustify'
  | 'indent' | 'outdent' | 'clearFormatting' | 'undo' | 'redo'

export function runEditorCommand(editor: Editor, command: EditorCommand): boolean {
  switch (command) {
    case 'paragraph': return editor.chain().setParagraph().run()
    case 'heading1': return editor.chain().setHeading({ level: 1 }).run()
    case 'heading2': return editor.chain().setHeading({ level: 2 }).run()
    case 'heading3': return editor.chain().setHeading({ level: 3 }).run()
    case 'bold': return editor.chain().toggleBold().run()
    case 'italic': return editor.chain().toggleItalic().run()
    case 'underline': return editor.chain().toggleUnderline().run()
    case 'strike': return editor.chain().toggleStrike().run()
    case 'code': return editor.chain().toggleCode().run()
    case 'highlight': return editor.chain().toggleHighlight({ color: '#fff0a8' }).run()
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

export function isEditorCommandActive(editor: Editor, command: EditorCommand): boolean {
  switch (command) {
    case 'paragraph': return editor.isActive('paragraph') && !editor.isActive('blockquote')
    case 'heading1': return editor.isActive('heading', { level: 1 })
    case 'heading2': return editor.isActive('heading', { level: 2 })
    case 'heading3': return editor.isActive('heading', { level: 3 })
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
    case 'code':
    case 'highlight':
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
  if (editor.isActive('heading', { level: 1 })) return '标题 1'
  if (editor.isActive('heading', { level: 2 })) return '标题 2'
  if (editor.isActive('heading', { level: 3 })) return '标题 3'
  return '正文'
}
