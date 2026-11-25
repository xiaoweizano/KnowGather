/**
 * Pure helpers for the rich blocks (math, diagrams, callouts, toggles,
 * columns). They live apart from the ProseMirror node definitions so the
 * normalisation rules and Markdown output can be unit-tested without a DOM.
 */

export type CalloutVariant = 'info' | 'success' | 'warning' | 'danger'

export const CALLOUT_VARIANTS: readonly CalloutVariant[] = ['info', 'success', 'warning', 'danger']

/** Diagram languages the insert menu offers; both render through Mermaid. */
export type DiagramLanguage = 'mermaid' | 'flowchart'

export const DIAGRAM_LANGUAGES: readonly DiagramLanguage[] = ['mermaid', 'flowchart']

const MAX_CODE_LENGTH = 20000

export function normalizeCalloutVariant(value: unknown): CalloutVariant {
  return CALLOUT_VARIANTS.includes(value as CalloutVariant) ? value as CalloutVariant : 'info'
}

export function normalizeDiagramLanguage(value: unknown): DiagramLanguage {
  return DIAGRAM_LANGUAGES.includes(value as DiagramLanguage) ? value as DiagramLanguage : 'mermaid'
}

/** Trims and caps pasted source so one block cannot balloon the document. */
export function normalizeBlockSource(value: unknown, max = MAX_CODE_LENGTH): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n?/g, '\n').slice(0, max)
}

export function normalizeToggleOpen(value: unknown): boolean {
  return value !== false
}

/** Template offered when a diagram is inserted, so the block is never blank. */
export function defaultDiagramSource(language: DiagramLanguage): string {
  return language === 'flowchart'
    ? ['flowchart LR', '  A[开始] --> B{判断}', '  B -->|是| C[执行]', '  B -->|否| D[结束]'].join('\n')
    : ['classDiagram', '  class 文档 {', '    +String 标题', '    +String 正文', '  }'].join('\n')
}

export function defaultMathSource(): string {
  return 'E = mc^2'
}

export interface RichNodeLike {
  type: string
  attrs?: Record<string, unknown> | null
  content?: RichNodeLike[]
  text?: string
}

const CALLOUT_MARKERS: Record<CalloutVariant, string> = {
  info: 'NOTE',
  success: 'TIP',
  warning: 'IMPORTANT',
  danger: 'CAUTION',
}

/** Markdown for one rich block; `renderChildren` handles nested content. */
export function richBlockToMarkdown(
  node: RichNodeLike,
  renderChildren: (children: RichNodeLike[]) => string,
): string | null {
  switch (node.type) {
    case 'mathBlock': {
      const latex = normalizeBlockSource(node.attrs?.latex)
      return latex ? `$$\n${latex}\n$$\n\n` : ''
    }
    case 'diagramBlock': {
      const code = normalizeBlockSource(node.attrs?.code)
      if (!code) return ''
      const language = normalizeDiagramLanguage(node.attrs?.language)
      return `\`\`\`${language}\n${code}\n\`\`\`\n\n`
    }
    case 'calloutBlock': {
      const variant = normalizeCalloutVariant(node.attrs?.variant)
      const body = renderChildren(node.content ?? []).trim()
      const quoted = body.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n')
      return `> [!${CALLOUT_MARKERS[variant]}]\n${quoted}\n\n`
    }
    case 'toggleBlock': {
      const body = renderChildren(node.content ?? []).trim()
      const summary = String(node.attrs?.summary ?? '')
      return `<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${body}\n\n</details>\n\n`
    }
    case 'columnsBlock':
      // Markdown has no columns; a rule keeps the reading order and makes the
      // split visible instead of silently flattening the layout.
      return `${(node.content ?? []).map((column) => renderChildren(column.content ?? []).trim()).filter(Boolean).join('\n\n---\n\n')}\n\n`
    default:
      return null
  }
}

/** One-line text contribution of a rich block for previews and word-less export. */
export function richBlockPreviewText(node: RichNodeLike): string | null {
  switch (node.type) {
    case 'mathBlock': {
      const latex = normalizeBlockSource(node.attrs?.latex).trim()
      return latex ? ` ${latex} ` : null
    }
    case 'diagramBlock': {
      const code = normalizeBlockSource(node.attrs?.code).trim()
      return code ? ` ${code} ` : null
    }
    case 'toggleBlock': {
      const summary = String(node.attrs?.summary ?? '').trim()
      return summary ? ` ${summary} ` : null
    }
    default:
      return null
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      default: return '&quot;'
    }
  })
}
