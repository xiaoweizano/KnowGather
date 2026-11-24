import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { createEditorExtensions } from '../src/renderer/src/editor/core/extensions'
import { BUILTIN_JOURNAL_TEMPLATES } from '../src/renderer/src/app/journalTemplates'

describe('built-in template schemas', () => {
  it('parses under the editor schema, so inserting any of them cannot throw', () => {
    const schema = getSchema(createEditorExtensions())
    for (const template of BUILTIN_JOURNAL_TEMPLATES) {
      let node: ReturnType<typeof schema.nodeFromJSON> | null = null
      expect(() => {
        node = schema.nodeFromJSON(template.content)
        node.check()
      }, template.id).not.toThrow()
      expect(node!.childCount, template.id).toBeGreaterThan(0)
    }
  })
})
