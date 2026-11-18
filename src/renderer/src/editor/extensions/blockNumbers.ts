import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface BlockNumbersOptions {
  /** Enabled at construction; toggling requires rebuilding the extension. */
  enabled: boolean
  /**
   * Block types that get a number. Every top-level block counts, so a list or
   * a table is one line even though it renders many visible rows.
   */
  types?: readonly string[]
}

export const DEFAULT_NUMBERED_BLOCKS = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'table',
  'horizontalRule',
  'image',
  'attachment',
] as const

export const blockNumbersPluginKey = new PluginKey('shizhi:block-numbers')

/**
 * Block-level line numbers.
 *
 * Numbers are attached as widget decorations before the *first inline child* of
 * each block rather than as a separate gutter, so they align with the block's
 * first text line without any coordinate maths — important because the editor
 * applies a CSS `zoom`, which makes viewport coordinates unreliable.
 */
export const BlockNumbers = Extension.create<BlockNumbersOptions>({
  name: 'shizhiBlockNumbers',

  addOptions() {
    return { enabled: false, types: DEFAULT_NUMBERED_BLOCKS }
  },

  addProseMirrorPlugins() {
    if (!this.options.enabled) return []
    const types = new Set(this.options.types ?? DEFAULT_NUMBERED_BLOCKS)

    return [
      new Plugin({
        key: blockNumbersPluginKey,
        props: {
          decorations(state: EditorState) {
            return buildNumberDecorations(state.doc, types)
          },
        },
      }),
    ]
  },
})

export function countNumberedBlocks(doc: ProseMirrorNode, types: ReadonlySet<string> = new Set(DEFAULT_NUMBERED_BLOCKS)): number {
  let count = 0
  doc.forEach((node) => {
    if (types.has(node.type.name)) count += 1
  })
  return count
}

export function buildNumberDecorations(
  doc: ProseMirrorNode,
  types: ReadonlySet<string> = new Set(DEFAULT_NUMBERED_BLOCKS),
): DecorationSet {
  const decorations: Decoration[] = []
  let line = 0
  doc.forEach((node, offset) => {
    if (!types.has(node.type.name)) return
    line += 1
    // Inside the block, one position after its start, is the first inline child.
    decorations.push(Decoration.widget(offset + 1, () => {
      const span = document.createElement('span')
      span.className = 'block-number'
      span.setAttribute('contenteditable', 'false')
      span.setAttribute('aria-hidden', 'true')
      span.textContent = String(line)
      return span
    }, { side: -1, ignoreSelection: true }))
  })
  return DecorationSet.create(doc, decorations)
}
