import type { SlashAction } from './overlayModel'
import type { Editor } from '@tiptap/core'
import type { TiptapNode } from '@shared/document'
import { translate } from '../../i18n'
import {
  defaultDiagramSource,
  defaultMathSource,
  type DiagramLanguage,
} from './richBlockModel'
import {
  createCalloutContent,
  createColumnsContent,
  createDiagramContent,
  createMathContent,
  createToggleContent,
} from '../extensions/richBlocks'

/** Slash actions that insert a rich block directly instead of opening a picker. */
export type RichSlashAction = 'math' | 'diagram' | 'callout' | 'toggle' | 'columns'

export function isRichSlashAction(action: SlashAction | undefined): action is RichSlashAction {
  return action === 'math' || action === 'diagram' || action === 'callout' || action === 'toggle' || action === 'columns'
}

/**
 * Content for one rich slash action. Kept apart from the component so the "+"
 * menu, the slash menu and the tests all build exactly the same JSON. It reads
 * the locale's translator directly, which is what the other core helpers do.
 */
export function richSlashContent(
  action: RichSlashAction,
  diagramLanguage: DiagramLanguage = 'mermaid',
): TiptapNode & Record<string, unknown> {
  switch (action) {
    case 'math':
      return createMathContent(defaultMathSource())
    case 'diagram':
      return createDiagramContent(diagramLanguage, defaultDiagramSource(diagramLanguage))
    case 'callout':
      return createCalloutContent()
    case 'toggle':
      return createToggleContent(translate('editor.toggle.defaultSummary'))
    case 'columns':
      return createColumnsContent(2)
  }
}

/**
 * Inserts a rich block *after* the block holding the caret, followed by an
 * empty paragraph.
 *
 * A plain `insertContent` splits the current block and leaves the caret inside
 * the newly inserted container, so the next insert lands inside the previous
 * callout instead of below it. Inserting at the top-level boundary and adding a
 * trailing paragraph keeps the caret where the author expects it.
 */
export function insertRichContent(editor: Editor, content: TiptapNode): boolean {
  const { state } = editor
  const { $from, to } = state.selection
  const pos = $from.depth > 0 ? $from.after(1) : to
  return editor.chain().focus().insertContentAt(pos, [content, { type: 'paragraph' }]).run()
}
