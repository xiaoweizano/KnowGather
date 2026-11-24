import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
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
    ShizhiImage,
    TableKit.configure({ table: { resizable: true } }),
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
      placeholder: ({ node }) =>
        node.type.name === 'heading' ? translate('editor.placeholder.heading') : translate('editor.placeholder.body'),
      showOnlyWhenEditable: true,
      includeChildren: true,
    }),
  ]
}
