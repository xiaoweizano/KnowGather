import { Extension, InputRule } from '@tiptap/core'

/**
 * Markdown block shortcuts that the bundled extensions do not already provide.
 *
 * StarterKit already turns `# `–`###### ` into headings (the heading extension
 * wires one input rule per enabled level), `> ` into quotes, `- ` / `1. ` into
 * lists, `---` into a divider and ``` into code blocks. Task lists have no such
 * rule upstream, so `[ ] ` / `[] ` is wired here to keep the whole Markdown
 * ladder consistent.
 */
export const MarkdownShortcuts = Extension.create({
  name: 'shizhiMarkdownShortcuts',

  addInputRules() {
    return [
      new InputRule({
        find: /^\s*\[(?: |x|X)?\]\s$/,
        handler: ({ state, range, chain }) => {
          if (!state.schema.nodes.taskList) return
          chain().deleteRange(range).toggleTaskList().run()
        },
      }),
    ]
  },
})
