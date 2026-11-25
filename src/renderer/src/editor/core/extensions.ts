import StarterKit from '@tiptap/starter-kit'
import type { Editor } from '@tiptap/core'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
// Placeholder has to come from the same @tiptap/extensions build as the rest of
// the editor: the standalone `@tiptap/extension-placeholder` copy resolves its
// own `@tiptap/pm`, which bundles a second prosemirror-view. Decorations made
// by that copy cannot be merged with ours — ProseMirror throws while diffing,
// and every command (toolbar included) dies silently.
import { Placeholder } from '@tiptap/extensions/placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontSize } from '@tiptap/extension-text-style/font-size'
import Color from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import { TableKit } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { CharacterCount } from '@tiptap/extensions/character-count'
import { Highlight } from '../extensions/highlight'
import { ShizhiImage } from '../extensions/image'
import { Attachment } from '../extensions/attachment'
import { BlockNumbers } from '../extensions/blockNumbers'
import { FoldHeadings } from '../extensions/foldHeadings'
import { FoldCommands } from '../extensions/foldCommands'
import { Subscript, Superscript } from '../extensions/script'
import { MarkdownShortcuts } from '../extensions/markdownShortcuts'
import { BlockFormat } from '../extensions/blockFormat'
import { CalloutBlock, Column, ColumnsBlock, DiagramBlock, MathBlock, ToggleBlock } from '../extensions/richBlocks'
import { TableKeyboard } from '../extensions/tableKeyboard'
import { translate } from '../../i18n'

export interface EditorFeatureOptions {
  /** Fold buttons on H1–H3. Disabled hides them and ignores stored folds. */
  foldHeadings?: boolean
  /** Restored collapsed heading identities for the open document. */
  initialFolds?: readonly string[]
  onFoldsChanged?: (folds: string[]) => void
  /** Block-level line numbers. */
  lineNumbers?: boolean
}

/**
 * True when the node at `pos` sits inside a table cell, so the body
 * placeholder stays out of grids.
 */
function isInsideTable(editor: Editor, pos: number): boolean {
  const $pos = editor.state.doc.resolve(Math.max(0, pos))
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'table') return true
  }
  return false
}

export function createEditorExtensions(options: EditorFeatureOptions = {}) {
  const foldHeadings = options.foldHeadings ?? true
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
      underline: false,
      undoRedo: { depth: 200, newGroupDelay: 420 },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
    }),
    TextStyle,
    FontSize,
    Color,
    Highlight,
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    BlockFormat,
    MathBlock,
    DiagramBlock,
    CalloutBlock,
    ToggleBlock,
    ColumnsBlock,
    Column,
    ShizhiImage,
    TableKit.configure({ table: { resizable: true } }),
    // After TableKit, so its own keymap gets first refusal.
    TableKeyboard,
    TaskList,
    TaskItem.configure({ nested: true }),
    MarkdownShortcuts,
    Attachment,
    CharacterCount,
    FoldHeadings.configure({
      levels: foldHeadings ? [1, 2, 3, 4, 5, 6] : [],
      initialFolds: options.initialFolds ?? [],
      onFoldsChanged: options.onFoldsChanged,
    }),
    FoldCommands,
    BlockNumbers.configure({ enabled: options.lineNumbers ?? false }),
    Placeholder.configure({
      // Cells get no hint: "开始记录此刻的想法…" inside a grid reads as leftover
      // body text. An empty string still marks the node as empty for layout,
      // it just draws nothing.
      placeholder: ({ editor, node, pos }) => {
        if (node.type.name === 'heading') return translate('editor.placeholder.heading')
        if (isInsideTable(editor, pos)) return ''
        return node.type.name === 'paragraph' ? translate('editor.placeholder.body') : ''
      },
      showOnlyWhenEditable: true,
      includeChildren: true,
    }),
  ]
}
