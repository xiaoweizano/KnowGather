import { Extension } from '@tiptap/core'
import { deleteEmptyTableOnBackspace } from '../core/tableCommands'

/**
 * Keyboard conveniences the bundled table extension does not provide.
 *
 * `@tiptap/extension-table` only reacts to Backspace when every cell is
 * selected, so a freshly inserted empty table could only be removed by first
 * selecting all of it. Backspace with the caret in an empty table now removes
 * the whole table, the way Yuque and Notion behave.
 *
 * Registered after TableKit: this returns `true` only in the narrow case it
 * handles, and Tiptap runs extensions in order, so ordinary backspacing inside
 * a cell keeps its default behaviour.
 */
export const TableKeyboard = Extension.create({
  name: 'shizhiTableKeyboard',

  addKeyboardShortcuts() {
    return {
      Backspace: () => deleteEmptyTableOnBackspace(this.editor),
    }
  },
})
