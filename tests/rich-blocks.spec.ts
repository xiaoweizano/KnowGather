import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createEditorExtensions } from '../src/renderer/src/editor/core/extensions'
import { documentToMarkdown, plainTextPreview } from '../src/renderer/src/editor/core/markdown'
import { SLASH_MENU_ITEMS, filterSlashMenuItems } from '../src/renderer/src/editor/core/overlayModel'
import { INSERT_MENU_ITEMS } from '../src/renderer/src/editor/core/toolbarConfig'
import { isRichSlashAction, insertRichContent, richSlashContent } from '../src/renderer/src/editor/core/slashInsert'
import {
  defaultDiagramSource,
  normalizeCalloutVariant,
  normalizeDiagramLanguage,
  normalizeBlockSource,
} from '../src/renderer/src/editor/core/richBlockModel'
import type { TiptapDocument } from '../src/shared/document'

const editors: Editor[] = []

function createEditor(content?: TiptapDocument): Editor {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  })
  editors.push(editor)
  return editor
}

afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

describe('rich block model', () => {
  it('normalizes unknown values instead of trusting document JSON', () => {
    expect(normalizeCalloutVariant('success')).toBe('success')
    expect(normalizeCalloutVariant('purple')).toBe('info')
    expect(normalizeDiagramLanguage('flowchart')).toBe('flowchart')
    expect(normalizeDiagramLanguage('plantuml')).toBe('mermaid')
    expect(normalizeBlockSource('a\r\nb')).toBe('a\nb')
    expect(normalizeBlockSource(42)).toBe('')
  })

  it('ships a usable diagram template per language', () => {
    expect(defaultDiagramSource('mermaid')).toContain('classDiagram')
    expect(defaultDiagramSource('flowchart')).toContain('flowchart LR')
  })
})

describe('rich block documents', () => {
  it('keeps formulas and diagrams as single non-editable units', () => {
    const editor = createEditor({
      type: 'doc',
      content: [richSlashContent('math'), richSlashContent('diagram')],
    })

    const types = (editor.getJSON().content ?? []).map((node) => node.type)
    expect(types).toEqual(['mathBlock', 'diagramBlock'])
    expect(editor.getJSON().content?.find((node) => node.type === 'mathBlock')?.attrs?.latex).toBe('E = mc^2')
    // Atoms own no text, so they cannot be edited in the prose stream.
    const math = editor.schema.nodes.mathBlock
    expect(math.spec.atom).toBe(true)
    expect(math.spec.content).toBeUndefined()
  })

  it('inserts editable callouts, toggles and two-column layouts', () => {
    const editor = createEditor({
      type: 'doc',
      content: [richSlashContent('callout'), richSlashContent('toggle'), richSlashContent('columns')],
    })
    const json = editor.getJSON()
    const serialized = JSON.stringify(json)
    expect(serialized).toContain('"type":"calloutBlock"')
    expect(serialized).toContain('"type":"toggleBlock"')
    expect(serialized).toContain('"type":"columnsBlock"')
    // A toggle starts open with a default summary, so it reads as a block.
    expect(json.content?.find((node) => node.type === 'toggleBlock')?.attrs?.open).toBe(true)
    expect(serialized.match(/"type":"column"/g)).toHaveLength(2)
    expect(editor.schema.nodes.calloutBlock.spec.content).toBe('block+')
  })

  it('inserts rich blocks after the current one, never nested inside it', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '开头' }] }],
    })
    editor.commands.setTextSelection(2)

    insertRichContent(editor, richSlashContent('callout'))
    insertRichContent(editor, richSlashContent('columns'))

    const blocks = editor.getJSON().content ?? []
    // The callout must not swallow the columns that follow it.
    const callout = blocks.find((node) => node.type === 'calloutBlock')
    expect(callout?.content?.some((node) => node.type === 'columnsBlock')).toBeFalsy()
    expect(blocks.map((node) => node.type)).toContain('columnsBlock')
    expect(blocks.filter((node) => node.type === 'paragraph').length).toBeGreaterThan(0)
  })

  it('round-trips rich blocks through JSON', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        richSlashContent('math'),
        richSlashContent('diagram'),
        richSlashContent('callout'),
        richSlashContent('toggle'),
        richSlashContent('columns'),
      ],
    })
    const json = editor.getJSON()
    const restored = createEditor(JSON.parse(JSON.stringify(json)) as TiptapDocument)
    expect(restored.getJSON()).toEqual(json)
  })
})

describe('rich block export', () => {
  it('renders formulas, diagrams, callouts, toggles and columns to Markdown', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'mathBlock', attrs: { latex: 'a^2 + b^2' } },
        { type: 'diagramBlock', attrs: { language: 'mermaid', code: 'graph TD\n  A-->B' } },
        { type: 'calloutBlock', attrs: { variant: 'warning' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '小心' }] }] },
        { type: 'toggleBlock', attrs: { summary: '更多', open: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }] },
        { type: 'columnsBlock', content: [
          { type: 'column', content: [{ type: 'paragraph', content: [{ type: 'text', text: '左' }] }] },
          { type: 'column', content: [{ type: 'paragraph', content: [{ type: 'text', text: '右' }] }] },
        ] },
      ],
    })
    const markdown = documentToMarkdown(editor.getJSON() as TiptapDocument)
    expect(markdown).toContain('$$\na^2 + b^2\n$$')
    expect(markdown).toContain('```mermaid\ngraph TD\n  A-->B\n```')
    expect(markdown).toContain('> [!IMPORTANT]\n> 小心')
    expect(markdown).toContain('<details>\n<summary>更多</summary>')
    expect(markdown).toContain('左\n\n---\n\n右')
  })

  it('contributes readable text to previews', () => {
    const preview = plainTextPreview({
      type: 'doc',
      content: [
        { type: 'mathBlock', attrs: { latex: 'E=mc^2' } },
        { type: 'toggleBlock', attrs: { summary: '要点' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '细节' }] }] },
      ],
    })
    expect(preview).toContain('E=mc^2')
    expect(preview).toContain('要点')
  })
})

describe('rich block entry points', () => {
  it('offers every rich block from the "+" menu', () => {
    const keys = INSERT_MENU_ITEMS.map((item) => item.key)
    for (const key of ['math', 'diagram', 'callout', 'toggle', 'columns']) {
      expect(keys).toContain(key)
    }
    // The quote and divider already have their own bar buttons; they should not
    // be duplicated in the menu.
    expect(keys).not.toContain('blockquote')
    expect(keys).not.toContain('horizontalRule')
  })

  it('offers the same blocks from the slash menu and finds them by keyword', () => {
    const rich = SLASH_MENU_ITEMS.filter((item) => isRichSlashAction(item.action))
    expect(rich.map((item) => item.action)).toEqual(['math', 'diagram', 'callout', 'toggle', 'columns'])
    expect(filterSlashMenuItems('公式').map((item) => item.key)).toContain('math')
    expect(filterSlashMenuItems('mermaid').map((item) => item.key)).toContain('diagram')
    expect(filterSlashMenuItems('折叠').map((item) => item.key)).toContain('toggle')
  })
})
