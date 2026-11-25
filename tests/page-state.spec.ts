import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createEditorExtensions } from '../src/renderer/src/editor/core/extensions'
import { isPageBlank } from '../src/renderer/src/editor/core/pageState'

const editors: Editor[] = []

function createEditor(content: Record<string, unknown>): Editor {
  const editor = new Editor({ extensions: createEditorExtensions(), content })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

const paragraph = (text?: string): Record<string, unknown> => (
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }
)

describe('blank page detection', () => {
  it('treats an empty document as blank', () => {
    expect(isPageBlank(createEditor({ type: 'doc', content: [paragraph()] }))).toBe(true)
  })

  it('treats typed text as content', () => {
    expect(isPageBlank(createEditor({ type: 'doc', content: [paragraph('写了几个字')] }))).toBe(false)
  })

  it('treats an inserted table as content even though the text is empty', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph()] })
    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    // `editor.isEmpty` still reports true here — that was the bug.
    expect(editor.isEmpty).toBe(true)
    expect(isPageBlank(editor)).toBe(false)
  })

  it('treats an image or a divider as content', () => {
    const image = createEditor({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'x.png' } }, paragraph()],
    })
    expect(isPageBlank(image)).toBe(false)

    const rule = createEditor({ type: 'doc', content: [{ type: 'horizontalRule' }, paragraph()] })
    expect(isPageBlank(rule)).toBe(false)
  })

  it('returns to blank when the page is emptied again', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('临时')] })
    expect(isPageBlank(editor)).toBe(false)
    editor.commands.setContent({ type: 'doc', content: [paragraph()] })
    expect(isPageBlank(editor)).toBe(true)
  })
})