import type { TiptapDocument, TiptapNode } from '../../../shared/document'

export interface OutlineItem {
  /** Heading level: 1–6, matching the editor's heading extension. */
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  /** Absolute document position of the heading node. */
  pos: number
}

export const OUTLINE_LEVELS = [1, 2, 3, 4, 5, 6] as const

/**
 * Collects H1–H6 headings in document order with their absolute positions.
 *
 * Positions follow ProseMirror's own arithmetic: a node's first child starts one
 * position after the node, and each child occupies its `nodeSize` (text length
 * for text nodes, 1 for leaves, content size + 2 otherwise). That means `pos`
 * can be handed straight to `setTextSelection(pos + 1)`.
 */
export function collectOutline(document: TiptapDocument): OutlineItem[] {
  const items: OutlineItem[] = []

  const walk = (node: TiptapNode, pos: number): void => {
    const isHeading = node.type === 'heading'
    const level = isHeading ? Number(node.attrs?.level) : 0
    if (isHeading && level >= 1 && level <= 6) {
      items.push({ level: level as OutlineItem['level'], text: nodeText(node).trim(), pos })
    }
    if (!node.content) return
    let childPos = pos + 1
    for (const child of node.content) {
      walk(child, childPos)
      childPos += nodeSize(child)
    }
  }

  let childPos = 0
  for (const child of document.content) {
    walk(child, childPos)
    childPos += nodeSize(child)
  }
  return items
}

/** ProseMirror node size for a JSON node. */
export function nodeSize(node: TiptapNode): number {
  if (node.type === 'text') return (node.text ?? '').length
  if (!node.content) return 1
  return node.content.reduce((total, child) => total + nodeSize(child), 0) + 2
}

/**
 * Index of the heading that contains (or precedes) `selectionFrom`, so the
 * outline can highlight where the caret currently is.
 */
export function activeHeadingIndex(outline: readonly OutlineItem[], selectionFrom: number): number {
  let index = -1
  for (const [position, item] of outline.entries()) {
    if (item.pos <= selectionFrom) index = position
    else break
  }
  return index
}

/** Plain label used by the outline; falls back for empty headings. */
export function outlineLabel(item: OutlineItem, fallback: string): string {
  return item.text || fallback
}

function nodeText(node: TiptapNode): string {
  if (typeof node.text === 'string') return node.text
  return (node.content ?? []).map(nodeText).join('')
}
