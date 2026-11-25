import { createApp, h, reactive, type App, type Component } from 'vue'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { NodeView } from '@tiptap/pm/view'
import type { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core'

/**
 * Mounts a Vue component as a ProseMirror node view.
 *
 * `@tiptap/vue-3` is not in the vendored dependency set, so the component is
 * mounted by hand on the node view's own DOM element. Attributes are pushed
 * through a reactive props object rather than remounting, which keeps the
 * diagram preview and its debounce state alive while the attribute changes.
 */
export interface VueNodeViewOptions {
  /** Component rendered inside the node view. */
  component: Component
  /** Node attribute names forwarded to the component as props. */
  attributes: readonly string[]
  /** Extra props resolved per node. */
  extraProps?: (node: ProseMirrorNode) => Record<string, unknown>
  /**
   * Called when the card body is clicked. Inside contenteditable every click
   * would otherwise be swallowed, so the caller picks the action: select the
   * atom, or move the caret into an editable descendant.
   */
  onActivate?: (props: NodeViewRendererProps) => void
}

export function createVueNodeView(options: VueNodeViewOptions): NodeViewRenderer {
  return (rendererProps: NodeViewRendererProps): NodeView => {
    const { node } = rendererProps
    const host = document.createElement('div')
    host.className = 'shizhi-node-view'
    host.dataset.nodeType = node.type.name

    const props = reactive<Record<string, unknown>>({ selected: false })
    const sync = (target: ProseMirrorNode): void => {
      for (const name of options.attributes) props[name] = target.attrs[name]
      Object.assign(props, options.extraProps?.(target) ?? {})
    }
    sync(node)

    host.addEventListener('mousedown', (event) => {
      // Selecting the node (rather than letting the click fall through) is what
      // makes Backspace / Delete remove the whole block.
      event.preventDefault()
      options.onActivate?.(rendererProps)
    })

    const app: App = createApp({ render: () => h(options.component, props) })
    app.mount(host)

    return {
      dom: host,
      // The card renders its own DOM from attributes; none of those mutations
      // come from ProseMirror, and letting them through would reset the view.
      stopEvent: (event) => (event.target as HTMLElement | null)?.closest('.shizhi-node-view') === host,
      ignoreMutation: () => true,
      update: (updated) => {
        if (updated.type !== node.type) return false
        sync(updated)
        return true
      },
      destroy: () => app.unmount(),
      selectNode: () => {
        props.selected = true
      },
      deselectNode: () => {
        props.selected = false
      },
    }
  }
}

