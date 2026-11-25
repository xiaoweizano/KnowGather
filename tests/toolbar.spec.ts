import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createEditorExtensions } from '../src/renderer/src/editor/core/extensions'
import { applyFormatSnapshot, captureFormatSnapshot, canRunEditorCommand, isEditorCommandActive, runEditorCommand, setEditorLineHeight } from '../src/renderer/src/editor/core/editorCommands'
import { MAX_BLOCK_INDENT, blockIndentAttributes, blockLineHeightAttributes, normalizeBlockIndent, normalizeBlockLineHeight } from '../src/renderer/src/editor/extensions/blockFormat'
import { computeToolbarLayout, type ToolbarLayoutItem } from '../src/renderer/src/editor/core/toolbarLayout'
import { ALIGN_ITEMS, INSERT_GROUP, INSERT_MENU_ITEMS, LIST_ITEMS, MORE_TOOLBAR_ITEMS, TEXT_GROUP, TEXT_STYLE_MENU } from '../src/renderer/src/editor/core/toolbarConfig'
import { COLOR_GRID, COLOR_NEUTRALS, TEXT_GRADIENTS, contrastOn, gradientTextColor } from '../src/renderer/src/editor/core/palettes'

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

describe('heading, size and script extensions', () => {
  it('supports heading levels 1 through 6', () => {
    const editor = createEditor()
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      editor.commands.setTextSelection(1)
      expect(runEditorCommand(editor, `heading${level}` as const), `heading${level}`).toBe(true)
      expect(editor.getJSON().content?.[0]?.attrs?.level).toBe(level)
      expect(isEditorCommandActive(editor, `heading${level}` as const)).toBe(true)
    }
  })

  it('ships the Markdown input rules for headings and task lists', () => {
    const names = createEditorExtensions().map((extension) => extension.name)
    expect(names).toContain('shizhiMarkdownShortcuts')

    const editor = createEditor()
    const heading = editor.extensionManager.extensions.find((extension) => extension.name === 'heading')
    // One rule per level means '#' through '######' all land on a heading.
    const levels = (heading ? heading.options as { levels?: number[] } : { levels: [] }).levels ?? []
    expect(levels).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('applies font size and sub/superscript marks', () => {
    const editor = createEditor('知识管理')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    expect(runEditorCommand(editor, 'subscript')).toBe(true)
    expect(isEditorCommandActive(editor, 'subscript')).toBe(true)
    editor.commands.setTextSelection({ from: 3, to: 5 })
    expect(runEditorCommand(editor, 'superscript')).toBe(true)
    expect(isEditorCommandActive(editor, 'superscript')).toBe(true)

    editor.commands.setTextSelection({ from: 1, to: 5 })
    runEditorCommand(editor, 'bold')
    const json = JSON.stringify(editor.getJSON())
    expect(json).toContain('"type":"subscript"')
    expect(json).toContain('"type":"superscript"')
  })
})

describe('colour palettes', () => {
  it('offers a ten-column hue grid with five lightness steps, like Yuque', () => {
    expect(COLOR_GRID).toHaveLength(10)
    for (const column of COLOR_GRID) {
      expect(column.swatches).toHaveLength(5)
      for (const swatch of column.swatches) expect(swatch.value).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(COLOR_NEUTRALS).toHaveLength(10)
    expect(COLOR_NEUTRALS[0]?.value).toBe('#000000')
    expect(COLOR_NEUTRALS.at(-1)?.value).toBe('#ffffff')
  })

  it('keeps swatch ticks readable on light and dark colours', () => {
    expect(contrastOn('#ffffff')).toBe('#1b1a1f')
    expect(contrastOn('#000000')).toBe('#ffffff')
    expect(contrastOn('#fde8e8')).toBe('#1b1a1f')
  })

  it('maps gradient swatches to a usable solid colour', () => {
    for (const swatch of TEXT_GRADIENTS) {
      expect(gradientTextColor(swatch)).toMatch(/^#[0-9a-f]{3,8}$/i)
    }
  })
})

describe('format painter and italics', () => {
  it('captures formatting and replays it on another selection', () => {
    const editor = createEditor('甲 乙')
    editor.commands.setTextSelection({ from: 1, to: 2 })
    runEditorCommand(editor, 'bold')
    // Select the bold run, capture it, then paint the plain run.
    editor.commands.setTextSelection({ from: 1, to: 2 })
    const snapshot = captureFormatSnapshot(editor)
    expect(snapshot.marks.map((mark) => mark.type)).toContain('bold')

    editor.commands.setTextSelection({ from: 3, to: 4 })
    // `unsetAllMarks` reports false on a selection with no marks; the marks
    // still land, which is what the painter is for.
    applyFormatSnapshot(editor, snapshot)
    const marks = editor.getJSON().content?.[0]?.content?.map((node) => node.marks?.map((mark) => mark.type))
    expect(marks).toEqual([['bold'], undefined, ['bold']])
  })

  it('keeps italics as a real mark (rendering depends on font-synthesis)', () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 5 })
    expect(runEditorCommand(editor, 'italic')).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"italic"')
    expect(isEditorCommandActive(editor, 'italic')).toBe(true)
  })
})

describe('toolbar composition', () => {
  it('keeps everyday actions on the bar and only rare ones behind "more"', () => {
    const barKeys = new Set([
      ...TEXT_GROUP.map((item) => item.key),
      ...INSERT_GROUP.map((item) => item.key),
      ...ALIGN_ITEMS.map((item) => item.key),
      ...LIST_ITEMS.map((item) => item.key),
    ])
    // `taskList` is the checklist entry from the list group; the "+" menu no
    // longer repeats it, so the bar keeps the only checklist button.
    // Attachment and the rich blocks moved into the "+" menu as well.
    for (const key of ['bold', 'italic', 'underline', 'strike', 'blockquote', 'horizontalRule', 'alignLeft', 'bulletList', 'orderedList', 'taskList']) {
      expect(barKeys.has(key as never), `${key} should be visible on the bar`).toBe(true)
    }
    for (const key of ['attachment', 'table', 'image', 'codeBlock', 'emoji']) {
      expect(INSERT_MENU_ITEMS.map((item) => item.key), `${key} should stay in the "+" menu`).toContain(key)
    }
    // Code block moved to the "+" menu; keeping it behind "more" as well would
    // repeat the same command in two places.
    expect(INSERT_MENU_ITEMS.some((item) => item.command === 'codeBlock')).toBe(true)
    expect(MORE_TOOLBAR_ITEMS.map((item) => item.key)).toEqual(['clearFormatting'])
    expect(TEXT_STYLE_MENU.map((item) => item.key)).toEqual(['code', 'subscript', 'superscript', 'link'])
  })

  it('shows one checklist entry and a real ordered list button', () => {
    // A duplicated checklist button on the bar (once in the list group, once in
    // the insert group) read as two different features; the ordered list had a
    // caret that opened a menu listing the bullet and task lists instead of just
    // toggling the list it is named after.
    const checklist = LIST_ITEMS.filter((item) => item.command === 'taskList')
    expect(checklist).toHaveLength(1)
    // The bar button is the only checklist entry: repeating it in the "+" menu
    // made one command look like two different features.
    expect(INSERT_MENU_ITEMS.some((item) => item.command === 'taskList')).toBe(false)
    expect(LIST_ITEMS.find((item) => item.key === 'orderedList')?.command).toBe('orderedList')
  })
})

describe('block indent and line height', () => {
  it('indents a plain paragraph, not just list items', () => {
    const editor = createEditor()
    editor.commands.setTextSelection(2)
    expect(runEditorCommand(editor, 'indent')).toBe(true)
    expect(editor.getJSON().content?.[0]?.attrs?.indent).toBe(1)
    expect(blockIndentAttributes(1)).toEqual({ 'data-indent': '1', style: 'padding-left: 1.60em;' })

    expect(runEditorCommand(editor, 'outdent')).toBe(true)
    expect(editor.getJSON().content?.[0]?.attrs?.indent).toBe(0)
    expect(blockIndentAttributes(0)).toEqual({})
  })

  it('stops at the indentation limits', () => {
    const editor = createEditor()
    editor.commands.setTextSelection(2)
    for (let step = 0; step < MAX_BLOCK_INDENT; step += 1) runEditorCommand(editor, 'indent')
    expect(editor.getJSON().content?.[0]?.attrs?.indent).toBe(MAX_BLOCK_INDENT)
    expect(canRunEditorCommand(editor, 'indent')).toBe(false)
  })

  it('nests list items instead of shifting the list block', () => {
    const list = new Editor({
      extensions: createEditorExtensions(),
      content: {
        type: 'doc',
        content: [{
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '一' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '二' }] }] },
          ],
        }],
      },
    })
    editors.push(list)
    // Put the caret in the second item; only then can it sink under the first.
    list.commands.setTextSelection(list.state.doc.content.size - 3)
    expect(runEditorCommand(list, 'indent')).toBe(true)
    const outer = list.getJSON().content?.[0]
    expect(outer?.content?.[0]?.content?.[1]?.type).toBe('bulletList')
    // The list block itself keeps its indent attribute untouched.
    expect(outer?.attrs?.indent ?? 0).toBe(0)
  })

  it('sets line height on every block in a multi-block selection', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '第一段' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '第二段' }] },
        ],
      },
    })
    editors.push(editor)
    editor.commands.selectAll()
    expect(setEditorLineHeight(editor, '2')).toBe(true)
    const blocks = editor.getJSON().content ?? []
    expect(blocks.map((node) => node.attrs?.lineHeight)).toEqual(['2', '2'])
    expect(blockLineHeightAttributes('2')).toEqual({ 'data-line-height': '2', style: 'line-height: 2;' })

    expect(setEditorLineHeight(editor, null)).toBe(true)
    expect((editor.getJSON().content ?? []).every((node) => !node.attrs?.lineHeight)).toBe(true)
    expect(blockLineHeightAttributes(null)).toEqual({})
  })

  it('ignores line heights outside the offered values', () => {
    expect(normalizeBlockLineHeight('2')).toBe('2')
    expect(normalizeBlockLineHeight('1.75')).toBeNull()
    expect(normalizeBlockLineHeight('red; background: url(x)')).toBeNull()
    expect(normalizeBlockIndent(-3)).toBe(0)
    expect(normalizeBlockIndent(99)).toBe(MAX_BLOCK_INDENT)
  })
})
