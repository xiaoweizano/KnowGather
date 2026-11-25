import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** A top-level block that shows nothing to the reader. */
function isBlankBlock(node: ProseMirrorNode): boolean {
  return node.type.name === 'paragraph' && node.content.size === 0
}

/**
 * True while the page has no visible content.
 *
 * `editor.isEmpty` only looks at text, so a table, image or divider on its own
 * still counts as empty there and the template suggestions stayed under the
 * inserted block. Anything that is not an empty paragraph counts as content.
 */
export function isPageBlank(editor: Editor | null | undefined): boolean {
  if (!editor) return true
  let blank = true
  editor.state.doc.forEach((node) => {
    if (!isBlankBlock(node)) blank = false
  })
  return blank
}