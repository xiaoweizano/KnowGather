import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface FoldHeadingsOptions {
  /** Which heading levels can be folded. */
  levels: readonly number[]
  /** Restored collapses, keyed by a stable heading identity. */
  initialFolds?: readonly string[]
  /** Called whenever the fold set changes so it can be persisted per document. */
  onFoldsChanged?: (folds: string[]) => void
}

export interface FoldState {
  /** Identities of collapsed headings. */
  folds: string[]
}

export const foldHeadingsPluginKey = new PluginKey<FoldState>('shizhi:fold-headings')

const TOGGLE_META = 'shizhi:fold-toggle'
const SET_META = 'shizhi:fold-set'

/**
 * Identifies a heading by level, its text and how many earlier headings share
 * that pair. Text-based identities survive insertion and reordering far better
 * than absolute positions, which go stale the moment one character is typed.
 */
export function headingIdentity(node: ProseMirrorNode, seen: Map<string, number>): string {
  const level = Number(node.attrs.level ?? 1)
  const text = node.textContent.trim().replace(/\s+/g, ' ')
  const base = `${level}|${text}`
  const count = (seen.get(base) ?? 0) + 1
  seen.set(base, count)
  return `${base}#${count}`
}

export interface FoldAnalysis {
  /** Pos of each foldable heading and its identity. */
  headings: Array<{ pos: number; identity: string; level: number }>
  /** Ranges hidden by the current fold set. */
  hidden: Array<{ from: number; to: number }>
}

/**
 * Works out which ranges a collapsed heading hides. Folding stops at the next
 * heading of the same or a higher level, which is what every outliner does.
 */
export function analyzeFolds(
  doc: ProseMirrorNode,
  folds: ReadonlySet<string>,
  levels: readonly number[] = [1, 2, 3],
): FoldAnalysis {
  const headings: FoldAnalysis['headings'] = []
  const hiddenByPosition = new Map<number, { from: number; to: number }>()
  const seen = new Map<string, number>()

  const blocks: Array<{ node: ProseMirrorNode; pos: number }> = []
  doc.forEach((node, offset) => blocks.push({ node, pos: offset }))

  for (const [index, block] of blocks.entries()) {
    if (block.node.type.name !== 'heading') continue
    const level = Number(block.node.attrs.level ?? 1)
    if (!levels.includes(level)) continue
    const identity = headingIdentity(block.node, seen)
    headings.push({ pos: block.pos, identity, level })
    if (!folds.has(identity)) continue

    for (const next of blocks.slice(index + 1)) {
      if (next.node.type.name === 'heading') {
        const nextLevel = Number(next.node.attrs.level ?? 1)
        if (nextLevel <= level) break
      }
      // A block can be hidden by an outer and an inner collapsed heading; keep
      // one range per position so overlapping decorations are not duplicated.
      hiddenByPosition.set(next.pos, { from: next.pos, to: next.pos + next.node.nodeSize })
    }
  }

  return { headings, hidden: [...hiddenByPosition.values()] }
}

/**
 * Collapsible headings.
 *
 * Implemented entirely with ProseMirror decorations: the document JSON is never
 * touched, so exports, clipboard output and Markdown are identical whether
 * anything is collapsed or not.
 */
export const FoldHeadings = Extension.create<FoldHeadingsOptions>({
  name: 'shizhiFoldHeadings',

  addOptions() {
    return {
      levels: [1, 2, 3],
      initialFolds: [],
      onFoldsChanged: undefined,
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    let lastReported: string[] | null = null

    const report = (folds: readonly string[]): void => {
      const next = [...folds]
      if (lastReported && sameList(lastReported, next)) return
      lastReported = next
      options.onFoldsChanged?.(next)
    }

    return [
      new Plugin<FoldState>({
        key: foldHeadingsPluginKey,
        state: {
          init: () => ({ folds: [...(options.initialFolds ?? [])] }),
          apply(tr: Transaction, previous: FoldState): FoldState {
            const toggle = tr.getMeta(TOGGLE_META) as string | undefined
            if (toggle) {
              const next = new Set(previous.folds)
              if (next.has(toggle)) next.delete(toggle)
              else next.add(toggle)
              return { folds: [...next].sort() }
            }
            const replace = tr.getMeta(SET_META) as string[] | undefined
            if (replace) return { folds: [...replace].sort() }
            return previous
          },
        },
        view: () => ({
          update: (view: EditorView) => {
            report(foldHeadingsPluginKey.getState(view.state)?.folds ?? [])
          },
        }),
        props: {
          decorations(state: EditorState) {
            const pluginState = foldHeadingsPluginKey.getState(state)
            if (!pluginState) return null
            return buildDecorations(state.doc, pluginState.folds, options.levels)
          },
          handleDOMEvents: {
            mousedown(view: EditorView, event: Event) {
              const target = event.target as HTMLElement | null
              const button = target?.closest<HTMLElement>('.fold-button')
              if (!button) return false
              const identity = button.dataset.foldIdentity
              if (!identity) return false
              // Prevent the caret from jumping into the heading before folding.
              event.preventDefault()
              view.dispatch(view.state.tr.setMeta(TOGGLE_META, identity))
              return true
            },
          },
        },
      }),
    ]
  },
})

/** Dispatches a toggle for the heading with the given identity. */
export function toggleFold(view: EditorView, identity: string): void {
  view.dispatch(view.state.tr.setMeta(TOGGLE_META, identity))
}

/** Collapses every foldable heading, or clears them all. */
export function setAllFolds(view: EditorView, collapsed: boolean, levels: readonly number[] = [1, 2, 3]): void {
  const state = view.state
  const analysis = analyzeFolds(state.doc, new Set(), levels)
  const identities = collapsed ? analysis.headings.map((heading) => heading.identity) : []
  view.dispatch(state.tr.setMeta(SET_META, identities))
}

export function currentFolds(state: EditorState): string[] {
  return foldHeadingsPluginKey.getState(state)?.folds ?? []
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function buildDecorations(
  doc: ProseMirrorNode,
  folds: readonly string[],
  levels: readonly number[],
): DecorationSet {
  const analysis = analyzeFolds(doc, new Set(folds), levels)
  const decorations: Decoration[] = []

  for (const heading of analysis.headings) {
    const collapsed = folds.includes(heading.identity)
    decorations.push(Decoration.widget(heading.pos + 1, () => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `fold-button${collapsed ? ' is-collapsed' : ''}`
      button.dataset.foldIdentity = heading.identity
      button.setAttribute('contenteditable', 'false')
      button.setAttribute('aria-label', collapsed ? 'editor.fold.expand' : 'editor.fold.collapse')
      button.title = collapsed ? 'editor.fold.expand' : 'editor.fold.collapse'
      button.textContent = collapsed ? '›' : '⌄'
      return button
    }, { side: -1, ignoreSelection: true }))
  }

  for (const range of analysis.hidden) {
    decorations.push(Decoration.node(range.from, range.to, { class: 'is-folded' }))
  }

  return DecorationSet.create(doc, decorations)
}
