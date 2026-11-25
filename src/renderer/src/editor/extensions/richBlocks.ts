import { mergeAttributes, Node } from '@tiptap/core'
import {
  normalizeBlockSource,
  normalizeCalloutVariant,
  normalizeDiagramLanguage,
  normalizeToggleOpen,
} from '../core/richBlockModel'

/**
 * Node views for the atom blocks live in `core/richBlockNodeViews.ts`.
 *
 * Keeping them out of this file means the schema stays loadable without Vue,
 * KaTeX or Mermaid — which is what lets the Node-based unit tests import it.
 */

/** Wraps the block in a parsed container so `data-type` can find it again. */
function parseContainer(element: HTMLElement, type: string): boolean {
  return element.getAttribute('data-type') === type
}

/**
 * Formula block (KaTeX).
 *
 * The LaTeX source lives in a node attribute rather than in node text: a
 * formula is a single opaque unit, and keeping it out of the text stream means
 * the caret, IME composition and word counting never try to edit it mid-way.
 */
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => normalizeBlockSource(element.getAttribute('data-latex')),
        renderHTML: (attributes) => ({ 'data-latex': normalizeBlockSource(attributes.latex) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mathBlock"]', getAttrs: (element) => parseContainer(element as HTMLElement, 'mathBlock') ? {} : false }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mathBlock', class: 'shizhi-math' }), `$$${normalizeBlockSource(HTMLAttributes['data-latex'])}$$`]
  },
})

/** Renders as a `<pre><code>` so copied text and Markdown keep the source. */
export const DiagramBlock = Node.create({
  name: 'diagramBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (element) => normalizeBlockSource(element.getAttribute('data-code') ?? element.textContent),
        renderHTML: (attributes) => ({ 'data-code': normalizeBlockSource(attributes.code) }),
      },
      language: {
        default: 'mermaid',
        parseHTML: (element) => normalizeDiagramLanguage(element.getAttribute('data-language')),
        renderHTML: (attributes) => ({ 'data-language': normalizeDiagramLanguage(attributes.language) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="diagramBlock"]', getAttrs: (element) => parseContainer(element as HTMLElement, 'diagramBlock') ? {} : false }]
  },

  renderHTML({ HTMLAttributes }) {
    const code = normalizeBlockSource(HTMLAttributes['data-code'])
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'diagramBlock', class: 'shizhi-diagram' }), ['pre', ['code', code]]]
  },
})

/** Coloured note box; the body is editable content, unlike the two above. */
export const CalloutBlock = Node.create({
  name: 'calloutBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (element) => normalizeCalloutVariant(element.getAttribute('data-variant')),
        renderHTML: (attributes) => ({ 'data-variant': normalizeCalloutVariant(attributes.variant) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="calloutBlock"]', getAttrs: (element) => parseContainer(element as HTMLElement, 'calloutBlock') ? {} : false }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'calloutBlock', class: 'shizhi-callout' }), 0]
  },
})

/**
 * Collapsible section. The open/closed flag is document state, not view state:
 * a folded section should look folded for anyone opening the document, and it
 * is part of what the author chose to show.
 */
export const ToggleBlock = Node.create({
  name: 'toggleBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      summary: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-summary') ?? '',
        renderHTML: (attributes) => ({ 'data-summary': String(attributes.summary ?? '') }),
      },
      open: {
        default: true,
        parseHTML: (element) => normalizeToggleOpen(element.getAttribute('data-open')),
        renderHTML: (attributes) => ({ 'data-open': normalizeToggleOpen(attributes.open) ? 'true' : 'false' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggleBlock"]', getAttrs: (element) => parseContainer(element as HTMLElement, 'toggleBlock') ? {} : false }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggleBlock',
        class: 'shizhi-toggle',
        'data-open': normalizeToggleOpen(HTMLAttributes['data-open']) ? 'true' : 'false',
      }),
      0,
    ]
  },
})

/** Side-by-side layout; each column holds its own block content. */
export const ColumnsBlock = Node.create({
  name: 'columnsBlock',
  group: 'block',
  content: 'column+',

  parseHTML() {
    return [{ tag: 'div[data-type="columnsBlock"]', getAttrs: (element) => parseContainer(element as HTMLElement, 'columnsBlock') ? {} : false }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columnsBlock', class: 'shizhi-columns' }), 0]
  },
})

export const Column = Node.create({
  name: 'column',
  content: 'block+',

  parseHTML() {
    return [{ tag: 'div[data-type="column"]', getAttrs: (element) => parseContainer(element as HTMLElement, 'column') ? {} : false }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'shizhi-column' }), 0]
  },
})

/** Builders used by the "+" menu and slash menu so both produce identical JSON. */
export function createCalloutContent(text = '') {
  return {
    type: 'calloutBlock',
    attrs: { variant: 'info' },
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  }
}

export function createToggleContent(summary = '') {
  return {
    type: 'toggleBlock',
    attrs: { summary, open: true },
    content: [{ type: 'paragraph' }],
  }
}

export function createColumnsContent(columns = 2) {
  return {
    type: 'columnsBlock',
    content: Array.from({ length: columns }, () => ({
      type: 'column',
      content: [{ type: 'paragraph' }],
    })),
  }
}

export function createMathContent(latex: string) {
  return { type: 'mathBlock', attrs: { latex } }
}

export function createDiagramContent(language: string, code: string) {
  return { type: 'diagramBlock', attrs: { language, code } }
}
