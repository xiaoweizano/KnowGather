import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { createEditorExtensions } from '../src/renderer/src/editor/core/extensions'
import {
  appendTableColumn,
  appendTableRow,
  deleteEmptyTableOnBackspace,
  findTableAtSelection,
  tableEdgePositions,
} from '../src/renderer/src/editor/core/tableCommands'

const editors: Editor[] = []

function createEditor(): Editor {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '前面一段' }] },
        { type: 'table', content: [
          { type: 'tableRow', content: [cell('a'), cell('b')] },
          { type: 'tableRow', content: [cell('c'), cell('d')] },
        ] },
      ],
    },
  })
  editors.push(editor)
  return editor
}

function cell(text: string): Record<string, unknown> {
  return { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

/** Caret inside the cell at `row` / `column` of the first table. */
function selectCell(editor: Editor, row: number, column: number): void {
  const table = findTableAtSelection(editor) ?? null
  const found = table ?? (() => {
    let result = null as ReturnType<typeof findTableAtSelection>
    editor.state.doc.descendants((node, pos) => {
      if (result) return false
      if (node.type.name === 'table') result = { node, pos }
      return true
    })
    return result
  })()
  if (!found) throw new Error('no table')
  const positions = tableEdgePositions(found)
  if (!positions) throw new Error('no cells')
  // Recompute the requested cell by walking the table's rows.
  let target: number | null = null
  let rowIndex = 0
  found.node.forEach((rowNode, rowOffset) => {
    if (rowIndex++ !== row) return
    let cellIndex = 0
    rowNode.forEach((_cellNode, cellOffset) => {
      if (cellIndex++ !== column) return
      target = found.pos + 1 + rowOffset + 1 + cellOffset + 2
    })
  })
  if (target === null) throw new Error('cell out of range')
  editor.commands.setTextSelection(target)
}

function dims(editor: Editor): { rows: number; columns: number } {
  const table = editor.state.doc.child(1)
  return { rows: table.childCount, columns: table.child(0).childCount }
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('growing a table', () => {
  it('appends a row under the last one', () => {
    const editor = createEditor()
    selectCell(editor, 0, 0)
    expect(dims(editor)).toEqual({ rows: 2, columns: 2 })

    expect(appendTableRow(editor)).toBe(true)
    expect(dims(editor)).toEqual({ rows: 3, columns: 2 })
  })

  it('appends a column to the right of the last one', () => {
    const editor = createEditor()
    selectCell(editor, 0, 0)
    expect(appendTableColumn(editor)).toBe(true)
    expect(dims(editor)).toEqual({ rows: 2, columns: 3 })
  })

  it('keeps working when the caret is not in a cell yet', () => {
    const editor = createEditor()
    editor.commands.setTextSelection(1)
    expect(dims(editor)).toEqual({ rows: 2, columns: 2 })

    expect(appendTableRow(editor)).toBe(true)
    expect(dims(editor)).toEqual({ rows: 3, columns: 2 })
    expect(appendTableColumn(editor)).toBe(true)
    expect(dims(editor)).toEqual({ rows: 3, columns: 3 })
  })

  it('appends repeatedly, not just once', () => {
    const editor = createEditor()
    for (let i = 0; i < 4; i += 1) expect(appendTableRow(editor)).toBe(true)
    expect(dims(editor)).toEqual({ rows: 6, columns: 2 })
  })

  it('reports the last row and last cell of the last row', () => {
    const editor = createEditor()
    let found = null as ReturnType<typeof findTableAtSelection>
    editor.state.doc.descendants((node, pos) => {
      if (found) return false
      if (node.type.name === 'table') found = { node, pos }
      return true
    })
    const positions = tableEdgePositions(found!)
    expect(positions).not.toBeNull()
    const lastRowStart = positions!.lastRow
    const lastCellStart = positions!.lastCell
    expect(lastCellStart).toBeGreaterThan(lastRowStart)
    // The last cell of the last row holds "d".
    expect(editor.state.doc.textBetween(lastCellStart, lastCellStart + 5)).toContain('d')
  })

  it('does nothing when there is no table', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '只有正文' }] }] },
    })
    editors.push(editor)
    expect(appendTableRow(editor)).toBe(false)
    expect(appendTableColumn(editor)).toBe(false)
  })
})
describe('deleting an empty table', () => {
  it('removes the table when Backspace is pressed at the start of an empty table', () => {
    const editor = createEditor()
    // Caret in the first cell, before its content.
    let found = null as ReturnType<typeof findTableAtSelection>
    editor.state.doc.descendants((node, pos) => {
      if (found) return false
      if (node.type.name === 'table') found = { node, pos }
      return true
    })
    editor.commands.setTextSelection(found!.pos + 3)
    // Fill nothing: the fixture cells hold letters, so this is NOT empty.
    expect(deleteEmptyTableOnBackspace(editor)).toBe(false)
    expect(editor.state.doc.child(1).type.name).toBe('table')
  })

  it('deletes a freshly inserted, still empty table', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }] },
    })
    editors.push(editor)
    editor.commands.setTextSelection(2)
    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    let table: { node: ProseMirrorNode; pos: number } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (table) return false
      if (node.type.name === 'table') { table = { node, pos }; return false }
      return true
    })
    expect(table).not.toBeNull()
    // Caret before the first cell's content.
    editor.commands.setTextSelection(table!.pos + 3)
    expect(deleteEmptyTableOnBackspace(editor)).toBe(true)
    const names: string[] = []
    editor.state.doc.forEach((node) => names.push(node.type.name))
    expect(names).not.toContain('table')
  })

  it('leaves a table with text alone', () => {
    const editor = createEditor()
    let found = null as ReturnType<typeof findTableAtSelection>
    editor.state.doc.descendants((node, pos) => {
      if (found) return false
      if (node.type.name === 'table') found = { node, pos }
      return true
    })
    editor.commands.setTextSelection(found!.pos + 4)
    expect(deleteEmptyTableOnBackspace(editor)).toBe(false)
  })

  it('does nothing while the table still holds content', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    editors.push(editor)
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })
    let table: { node: ProseMirrorNode; pos: number } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (table) return false
      if (node.type.name === 'table') { table = { node, pos }; return false }
      return true
    })
    const positions = tableEdgePositions(table!)
    const tr = editor.state.tr.insertText('内容', positions!.lastCell)
    editor.view.dispatch(tr)
    editor.commands.setTextSelection(positions!.lastCell + 1)
    expect(deleteEmptyTableOnBackspace(editor)).toBe(false)
    const names: string[] = []
    editor.state.doc.forEach((node) => names.push(node.type.name))
    expect(names).toContain('table')
  })

  it('does nothing when there is a selection, not a caret', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    editors.push(editor)
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })
    let table: { node: ProseMirrorNode; pos: number } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (table) return false
      if (node.type.name === 'table') { table = { node, pos }; return false }
      return true
    })
    const positions = tableEdgePositions(table!)
    editor.commands.setTextSelection({ from: positions!.lastRow, to: positions!.lastCell })
    expect(deleteEmptyTableOnBackspace(editor)).toBe(false)
  })
})
