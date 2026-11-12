import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

const editors: Editor[] = []

function createEditor(): Editor {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: { depth: 200, newGroupDelay: 400 } })],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '中文输入测试' }] }],
    },
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('single long-lived editor lifecycle', () => {
  it('keeps instance, selection, document and undo history across an external save', async () => {
    const editor = createEditor()
    const instanceId = editor.instanceId
    editor.commands.setTextSelection({ from: 3, to: 5 })
    const beforeSave = JSON.stringify(editor.getJSON())
    const selectionBefore = { from: editor.state.selection.from, to: editor.state.selection.to }
    editor.view.dispatch(editor.state.tr.insertText('新的', 3, 5))
    const selectionAfterEdit = { from: editor.state.selection.from, to: editor.state.selection.to }

    const repositorySave = vi.fn(async (payload: { revision: number }) => ({
      revision: payload.revision,
      version: 2,
      savedAt: new Date().toISOString(),
    }))
    await repositorySave({ revision: 1 })

    expect(editor.instanceId).toBe(instanceId)
    expect(editor.getJSON()).not.toBe(beforeSave)
    expect({ from: editor.state.selection.from, to: editor.state.selection.to }).not.toEqual(selectionBefore)
    expect(selectionAfterEdit).toEqual({ from: 5, to: 5 })
    expect(editor.extensionManager.extensions.some((extension) => extension.name === 'undoRedo')).toBe(true)
    expect(editor.commands.undo).toBeTypeOf('function')
    expect(editor.commands.redo).toBeTypeOf('function')
  })
})
