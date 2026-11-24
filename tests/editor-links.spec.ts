import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import {
  applyEditorLink,
  getActiveLinkRange,
  normalizeLinkHref,
} from '../src/renderer/src/editor/core/editorCommands'

const editors: Editor[] = []

function createEditor(text = '拾知笔记'): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
    ],
    content: {
      type: 'doc',
      content: [text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }],
    },
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('link href normalisation', () => {
  it('gives bare hosts a scheme and keeps known ones intact', () => {
    expect(normalizeLinkHref('  www.baidu.com ')).toBe('https://www.baidu.com')
    expect(normalizeLinkHref('https://example.com/a')).toBe('https://example.com/a')
    expect(normalizeLinkHref('mailto:hi@example.com')).toBe('mailto:hi@example.com')
    expect(normalizeLinkHref('#section')).toBe('#section')
    expect(normalizeLinkHref('/docs/a')).toBe('/docs/a')
    expect(normalizeLinkHref('   ')).toBe('')
  })
})

describe('applying the link card', () => {
  it('replaces the selected text and links it', () => {
    const editor = createEditor('拾知笔记')
    editor.commands.setTextSelection({ from: 1, to: 3 })

    expect(applyEditorLink(editor, '测试', 'www.baidu.com')).toBe(true)
    expect(editor.state.doc.textContent).toBe('测试笔记')
    expect(editor.getAttributes('link').href).toBe('https://www.baidu.com')
    expect(editor.isActive('link')).toBe(true)
  })

  it('inserts a link at a collapsed caret and falls back to the href as label', () => {
    const editor = createEditor('')
    editor.commands.setTextSelection(1)

    expect(applyEditorLink(editor, '   ', 'www.baidu.com')).toBe(true)
    expect(editor.state.doc.textContent).toBe('https://www.baidu.com')
    expect(editor.getAttributes('link').href).toBe('https://www.baidu.com')
  })

  it('rewrites the label and href of the link under the caret', () => {
    const editor = createEditor('测试笔记')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    applyEditorLink(editor, '测试', 'www.baidu.com')

    editor.commands.setTextSelection(2)
    expect(getActiveLinkRange(editor)).toEqual({ from: 1, to: 3 })

    expect(applyEditorLink(editor, '新的', 'https://example.com')).toBe(true)
    expect(editor.state.doc.textContent).toBe('新的笔记')
    expect(editor.getAttributes('link').href).toBe('https://example.com')
  })

  it('removes the link mark when the href is cleared', () => {
    const editor = createEditor('测试笔记')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    applyEditorLink(editor, '测试', 'www.baidu.com')

    editor.commands.setTextSelection(2)
    expect(applyEditorLink(editor, '测试', '')).toBe(true)
    expect(editor.isActive('link')).toBe(false)
    expect(editor.state.doc.textContent).toBe('测试笔记')
  })

  it('only reports a link range for text that is actually linked', () => {
    const editor = createEditor('拾知笔记')
    editor.commands.setTextSelection(2)
    expect(getActiveLinkRange(editor)).toBeNull()
  })
})