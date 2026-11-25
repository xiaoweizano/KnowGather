import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Positions needed to grow a table from its last row or last column.
 *
 * Both commands (`addRowAfter`, `addColumnAfter`) act on the caret's cell, so
 * the edge handles first move the caret into the last row / column regardless
 * of where the author was typing.
 */
export interface TableEdgePositions {
  /** Caret position inside the last row's first cell. */
  lastRow: number
  /** Caret position inside the last row's last cell. */
  lastCell: number
}

export interface TableAtDom {
  node: ProseMirrorNode
  /** Position directly before the table node. */
  pos: number
}

/**
 * The table node whose rendered DOM node is the given element.
 *
 * Matching on `nodeDOM` identity is exact: resolving a DOM position and
 * walking up from it depends on where the boundary lands, which for a table
 * differs between the first and later blocks — that made "add row" work only
 * some of the time.
 */
export function findTableAtDom(editor: Editor, element: Element | null): TableAtDom | null {
  if (!element) return null
  const tableElement = element.closest('table')
  if (!tableElement || !editor.view.dom.contains(tableElement)) return null
  let found: TableAtDom | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found) return false
    if (node.type.name === 'table' && editor.view.nodeDOM(pos) === tableElement) {
      found = { node, pos }
      return false
    }
    return true
  })
  return found
}

/** The table around the caret, used when no DOM element is at hand. */
export function findTableAtSelection(editor: Editor): TableAtDom | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'table') return { node, pos: $from.before(depth) }
  }
  return null
}

export function tableEdgePositions(table: TableAtDom): TableEdgePositions | null {
  const rows: number[][] = []
  table.node.forEach((row, rowOffset) => {
    const rowStart = table.pos + 1 + rowOffset
    const cells: number[] = []
    row.forEach((_cell, cellOffset) => {
      // +1 into the row's content, +1 into the cell, +1 again to stand inside
      // the cell's first paragraph. Landing on the cell boundary is not a text
      // position, so `setTextSelection` there fails and the whole command
      // silently does nothing.
      cells.push(rowStart + 1 + cellOffset + 2)
    })
    rows.push(cells)
  })
  if (!rows.length) return null
  const lastRow = rows[rows.length - 1]!
  if (!lastRow.length) return null
  return { lastRow: lastRow[0]!, lastCell: lastRow[lastRow.length - 1]! }
}

function resolveTable(editor: Editor, element: Element | null): TableAtDom | null {
  const byDom = findTableAtDom(editor, element)
  if (byDom) return byDom
  const bySelection = findTableAtSelection(editor)
  if (bySelection) return bySelection
  // Last resort: a lone table in the document is unambiguous. This keeps the
  // handles working when the DOM node they remembered was replaced (a
  // transaction can rebuild it) while the pointer still sits on the table.
  const tables: TableAtDom[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') tables.push({ node, pos })
    return true
  })
  return tables.length === 1 ? tables[0]! : null
}

/** Appends a row under the last one; the caret lands in the new row. */
export function appendTableRow(editor: Editor, element: Element | null = null): boolean {
  const table = resolveTable(editor, element)
  if (!table) return false
  const positions = tableEdgePositions(table)
  if (!positions) return false
  // Focus runs after the edit: a chain that starts with `focus()` aborts in a
  // headless editor (no DOM to focus), which turned the command into a no-op.
  const applied = editor.chain().setTextSelection(positions.lastRow).addRowAfter().run()
  if (applied) editor.commands.focus()
  return applied
}

/** Appends a column to the right of the last one. */
export function appendTableColumn(editor: Editor, element: Element | null = null): boolean {
  const table = resolveTable(editor, element)
  if (!table) return false
  const positions = tableEdgePositions(table)
  if (!positions) return false
  const applied = editor.chain().setTextSelection(positions.lastCell).addColumnAfter().run()
  if (applied) editor.commands.focus()
  return applied
}

/** True when every cell of the table holds nothing but an empty paragraph. */
export function isTableEmpty(node: ProseMirrorNode): boolean {
  let empty = true
  node.descendants((child) => {
    if (!empty) return false
    if (child.isText && child.text && child.text.trim().length > 0) empty = false
    if (child.type.name === 'image' || child.type.name === 'attachment') empty = false
    return true
  })
  return empty
}

/**
 * Backspace inside an empty table deletes the whole table, the way Yuque and
 * Notion do it.
 *
 * The table extension only reacts to Backspace when *every* cell is selected,
 * so pressing it inside a freshly inserted table did nothing at all. The rule
 * stays narrow: the caret is collapsed and the table holds no content, so
 * nothing can be lost — Backspace while writing never wipes a table.
 */
export function deleteEmptyTableOnBackspace(editor: Editor): boolean {
  const { selection } = editor.state
  if (!selection.empty) return false
  const table = findTableAtSelection(editor)
  if (!table || !isTableEmpty(table.node)) return false
  return editor.commands.deleteTable()
}