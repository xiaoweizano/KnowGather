import type { Editor, JSONContent } from '@tiptap/core'
import type { TiptapDocument } from '../../../../shared/document'

/**
 * Inserts a template into the open editor.
 *
 * An empty page is filled outright: inserting blocks into its lone empty
 * paragraph would leave a blank first line. A page that already has content
 * receives the template at the caret so the writing above stays intact.
 */
export function insertTemplateContent(editor: Editor, content: TiptapDocument): void {
  const nodes = JSON.parse(JSON.stringify(content.content ?? [])) as TiptapDocument['content']
  if (nodes.length === 0) return
  if (editor.isEmpty) {
    const filled: JSONContent = { type: 'doc', content: nodes as unknown as JSONContent[] }
    editor.chain().focus().setContent(filled, { errorOnInvalidContent: false }).run()
    return
  }
  editor.chain().focus().insertContent(nodes as unknown as JSONContent[]).run()
}
