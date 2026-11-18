import { Extension } from '@tiptap/core'
import { setAllFolds } from '../extensions/foldHeadings'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shizhiFolding: {
      /** Collapse every foldable heading. */
      foldAllHeadings: () => ReturnType
      /** Expand every heading. */
      unfoldAllHeadings: () => ReturnType
    }
  }
}

/** Adds `foldAllHeadings` / `unfoldAllHeadings` to the editor command chain. */
export const FoldCommands = Extension.create({
  name: 'shizhiFoldCommands',

  addCommands() {
    return {
      foldAllHeadings: () => ({ view }) => {
        setAllFolds(view, true)
        return true
      },
      unfoldAllHeadings: () => ({ view }) => {
        setAllFolds(view, false)
        return true
      },
    }
  },
})
