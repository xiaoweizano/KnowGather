import { Mark, mergeAttributes } from '@tiptap/core'

export interface ScriptMarkOptions {
  HTMLAttributes: Record<string, unknown>
  /** Shortcut handled by ProseMirror; stored separately for each mark. */
  keyboardShortcut: string | null
}

/**
 * Subscript and superscript are tiny marks with no attributes, so they are
 * defined here instead of pulling in two more packages.
 */
function defineScriptMark(name: 'subscript' | 'superscript', tag: 'sub' | 'sup', shortcut: string) {
  return Mark.create<ScriptMarkOptions>({
    name,

    addOptions() {
      return { HTMLAttributes: {}, keyboardShortcut: shortcut }
    },

    parseHTML() {
      return [{ tag }]
    },

    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    },

    addKeyboardShortcuts() {
      return this.options.keyboardShortcut
        ? { [this.options.keyboardShortcut]: () => this.editor.commands.toggleMark(name) }
        : {}
    },
  })
}

export const Subscript = defineScriptMark('subscript', 'sub', 'Mod-,')
export const Superscript = defineScriptMark('superscript', 'sup', 'Mod-.')
