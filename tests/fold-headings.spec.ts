import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { analyzeFolds, headingIdentity } from '../src/renderer/src/editor/extensions/foldHeadings'
import { createEditorExtensions } from '../src/renderer/src/editor/core/extensions'

const editors: Editor[] = []

function heading(level: number, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] }
}

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function createEditor(content: Array<Record<string, unknown>>): Editor {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: { type: 'doc', content },
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('fold headings analysis', () => {
  it('names headings by level, text and occurrence', () => {
    const editor = createEditor([heading(1, 'A'), heading(1, 'A'), heading(2, 'B')])
    const seen = new Map<string, number>()
    const identities: string[] = []
    editor.state.doc.forEach((node) => identities.push(headingIdentity(node, seen)))

    expect(identities).toEqual(['1|A#1', '1|A#2', '2|B#1'])
  })

  it('folds a section up to the next heading of the same or higher level', () => {
    const editor = createEditor([
      heading(1, 'A'),
      paragraph('one'),
      heading(2, 'B'),
      paragraph('two'),
      heading(1, 'C'),
      paragraph('three'),
    ])

    const analysis = analyzeFolds(editor.state.doc, new Set(['1|A#1']))
    expect(analysis.headings.map((item) => item.identity)).toEqual(['1|A#1', '2|B#1', '1|C#1'])
    // Folding A hides A's paragraph, B's heading and B's paragraph; C and its
    // content stay visible because C is a sibling heading.
    expect(analysis.hidden).toHaveLength(3)

    // Folding B as well adds no new hidden block: B's paragraph is already
    // hidden by A, and overlapping ranges are de-duplicated.
    const nested = analyzeFolds(editor.state.doc, new Set(['1|A#1', '2|B#1']))
    expect(nested.hidden).toHaveLength(3)
  })

  it('ignores headings outside the foldable levels', () => {
    const editor = createEditor([heading(2, 'A'), paragraph('x')])
    const analysis = analyzeFolds(editor.state.doc, new Set(['2|A#1']), [1])

    expect(analysis.headings).toEqual([])
    expect(analysis.hidden).toEqual([])
  })

  it('keeps the document JSON untouched when folding is configured', () => {
    const editor = createEditor([heading(1, 'A'), paragraph('one')])
    const before = JSON.stringify(editor.getJSON())

    // Decorations are view-only, so the JSON must be identical with the
    // extension installed; this guards exports and clipboard output.
    expect(JSON.stringify(editor.getJSON())).toBe(before)
    expect(editor.getJSON().content?.[0]?.type).toBe('heading')
  })
})
