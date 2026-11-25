import type { NodeViewRendererProps } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { NodeView } from '@tiptap/pm/view'
import { NodeSelection } from '@tiptap/pm/state'
import MathBlockView from '../components/MathBlockView.vue'
import DiagramBlockView from '../components/DiagramBlockView.vue'
import { createVueNodeView } from './richBlockNodeView'
import { normalizeToggleOpen } from './richBlockModel'
import { DiagramBlock, MathBlock, ToggleBlock } from '../extensions/richBlocks'

/** Node names whose plain schema version these views replace. */
export const RICH_NODE_NAMES: ReadonlySet<string> = new Set(['mathBlock', 'diagramBlock', 'toggleBlock'])

/** Selecting an atom node is what makes Backspace remove the whole block. */
function selectAtom(props: NodeViewRendererProps): void {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  const { state } = props.editor.view
  props.editor.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
  props.editor.view.focus()
}

/**
 * The rich block nodes with their visual node views attached.
 *
 * The schema itself lives in `extensions/richBlocks.ts` and stays free of Vue
 * imports so the Node-based unit tests can load it untouched. Here each node is
 * extended with a node view and handed to Tiptap after the plain definitions,
 * which replaces the default renderer for the live editor only.
 */
export function createRichBlockViews() {
  return [
    MathBlock.extend({
      addNodeView() {
        return createVueNodeView({ component: MathBlockView, attributes: ['latex'], onActivate: selectAtom })
      },
    }),
    DiagramBlock.extend({
      addNodeView() {
        return createVueNodeView({ component: DiagramBlockView, attributes: ['code', 'language'], onActivate: selectAtom })
      },
    }),
    ToggleBlock.extend({
      // Content-bearing, so the view is a wrapper whose body is `contentDOM`:
      // the caret stays in normal prose, and the summary row only flips `open`.
      addNodeView() {
        return ({ node, editor, getPos }: NodeViewRendererProps): NodeView => {
          const dom = document.createElement('div')
          dom.className = 'shizhi-toggle'
          dom.dataset.type = 'toggleBlock'

          const summary = document.createElement('button')
          summary.type = 'button'
          summary.className = 'shizhi-toggle-summary'
          summary.setAttribute('contenteditable', 'false')
          const caret = document.createElement('span')
          caret.className = 'shizhi-toggle-caret'
          const label = document.createElement('span')
          label.className = 'shizhi-toggle-label'
          summary.append(caret, label)

          const contentDOM = document.createElement('div')
          contentDOM.className = 'shizhi-toggle-body'
          dom.append(summary, contentDOM)

          const paint = (current: ProseMirrorNode): void => {
            const open = normalizeToggleOpen(current.attrs.open)
            dom.dataset.open = open ? 'true' : 'false'
            caret.textContent = open ? '▾' : '▸'
            label.textContent = String(current.attrs.summary ?? '')
          }
          paint(node)

          summary.addEventListener('mousedown', (event) => event.preventDefault())
          summary.addEventListener('click', () => {
            const pos = getPos()
            if (typeof pos !== 'number') return
            const current = editor.state.doc.nodeAt(pos)
            if (!current) return
            editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'open', !normalizeToggleOpen(current.attrs.open)))
            editor.view.focus()
          })

          return {
            dom,
            contentDOM,
            update: (updated: ProseMirrorNode) => {
              if (updated.type !== node.type) return false
              paint(updated)
              return true
            },
          }
        }
      },
    }),
  ]
}
