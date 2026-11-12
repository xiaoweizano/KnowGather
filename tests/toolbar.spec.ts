import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createEditorExtensions } from '../src/renderer/src/editor/core/extensions'
import { isEditorCommandActive, runEditorCommand } from '../src/renderer/src/editor/core/editorCommands'
import { computeToolbarLayout, type ToolbarLayoutItem } from '../src/renderer/src/editor/core/toolbarLayout'

const editors: Editor[] = []

function createEditor(text = '知识管理'): Editor {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('formatting commands', () => {
  it('applies marks to the retained text selection', () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 5 })
    const selection = { from: editor.state.selection.from, to: editor.state.selection.to }

    expect(runEditorCommand(editor, 'bold')).toBe(true)
    expect(isEditorCommandActive(editor, 'bold')).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"bold"')
    expect({ from: editor.state.selection.from, to: editor.state.selection.to }).toEqual(selection)

    expect(runEditorCommand(editor, 'underline')).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"underline"')
    expect(runEditorCommand(editor, 'highlight')).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"highlight"')
  })

  it('switches block types and list structures predictably', () => {
    const editor = createEditor()
    editor.commands.setTextSelection(3)

    expect(runEditorCommand(editor, 'heading2')).toBe(true)
    expect(isEditorCommandActive(editor, 'heading2')).toBe(true)
    expect(runEditorCommand(editor, 'blockquote')).toBe(true)
    expect(editor.getJSON().content?.[0]?.type).toBe('blockquote')
    expect(runEditorCommand(editor, 'taskList')).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"taskList"')
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"taskItem"')
  })

  it('supports text alignment, clear formatting, undo and redo', () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 5 })
    runEditorCommand(editor, 'bold')
    runEditorCommand(editor, 'alignCenter')
    expect(JSON.stringify(editor.getJSON())).toContain('"textAlign":"center"')
    expect(isEditorCommandActive(editor, 'alignCenter')).toBe(true)

    expect(runEditorCommand(editor, 'clearFormatting')).toBe(true)
    expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"bold"')
    expect(JSON.stringify(editor.getJSON())).not.toContain('"textAlign":"center"')

    expect(editor.extensionManager.extensions.some((extension) => extension.name === 'undoRedo')).toBe(true)
    expect(editor.commands.undo).toBeTypeOf('function')
    expect(editor.commands.redo).toBeTypeOf('function')
    expect(runEditorCommand(editor, 'undo')).toBe(false)
  })
})

describe('toolbar folding', () => {
  const items: ToolbarLayoutItem[] = [
    { key: 'bold', width: 30, priority: 100 },
    { key: 'italic', width: 30, priority: 90 },
    { key: 'underline', width: 30, priority: 80 },
    { key: 'quote', width: 30, priority: 30 },
    { key: 'table', width: 30, priority: 20 },
    { key: 'divider', width: 30, priority: 10 },
  ]

  it('keeps high-priority tools first and folds the rest without overflow', () => {
    const layout = computeToolbarLayout(170, items, { fixedWidth: 80 })
    expect(layout.visible).toContain('bold')
    expect(layout.visible).toContain('italic')
    expect(layout.overflow).toContain('divider')
    expect(layout.usedWidth).toBeLessThanOrEqual(170 - 80)
  })

  it('shows all tools when enough width is available', () => {
    const layout = computeToolbarLayout(500, items, { fixedWidth: 80 })
    expect(layout.overflow).toEqual([])
    expect(layout.visible).toEqual(items.map((item) => item.key))
  })
})
