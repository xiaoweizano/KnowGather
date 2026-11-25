import { Extension } from '@tiptap/core'

/** Levels of block indentation a paragraph or heading can carry. */
export const MAX_BLOCK_INDENT = 6

/** Line-height choices offered by the toolbar; `null` means "follow settings". */
export const LINE_HEIGHTS: readonly string[] = ['1.4', '1.5', '1.6', '1.8', '2', '2.5']

const BLOCK_TYPES = ['paragraph', 'heading'] as const

export interface BlockFormatOptions {
  types: string[]
  maxIndent: number
}

/**
 * Per-block indent and line-height.
 *
 * Both live on the block node (paragraph / heading) rather than on an inline
 * mark: indenting a paragraph has to move the whole block, and a line height
 * set on a text run leaves every other line in the block at the default.
 * They render as inline styles so exported HTML and older documents keep them.
 */
export const BlockFormat = Extension.create<BlockFormatOptions>({
  name: 'blockFormat',

  addOptions() {
    return { types: [...BLOCK_TYPES], maxIndent: MAX_BLOCK_INDENT }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => normalizeBlockIndent(element.getAttribute('data-indent') ?? element.style.paddingLeft),
            renderHTML: (attributes) => renderIndent(attributes.indent),
          },
          lineHeight: {
            default: null,
            parseHTML: (element) => normalizeBlockLineHeight(element.getAttribute('data-line-height') ?? element.style.lineHeight),
            renderHTML: (attributes) => renderLineHeight(attributes.lineHeight),
          },
        },
      },
    ]
  },
})

/** Indent level → padding. Self-contained: see the note in `addGlobalAttributes`. */
export function renderIndent(value: unknown): Record<string, string> {
  const raw = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  const level = Number.isFinite(raw) ? Math.max(0, Math.min(MAX_BLOCK_INDENT, Math.round(raw))) : 0
  if (!level) return {}
  return { 'data-indent': String(level), style: `padding-left: ${(level * 1.6).toFixed(2)}em;` }
}

/** Line height → inline style. Self-contained: see the note above. */
export function renderLineHeight(value: unknown): Record<string, string> {
  if (value === null || value === undefined) return {}
  const height = String(value).trim().toLowerCase()
  if (!LINE_HEIGHTS.includes(height)) return {}
  return { 'data-line-height': height, style: `line-height: ${height};` }
}

export function normalizeBlockIndent(value: unknown): number {
  const level = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(level)) return 0
  return Math.max(0, Math.min(MAX_BLOCK_INDENT, Math.round(level)))
}

export function normalizeBlockLineHeight(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim().toLowerCase()
  if (!LINE_HEIGHTS.includes(text)) return null
  return text
}

/** Rendered attributes for one indent level; plain blocks render nothing. */
export function blockIndentAttributes(value: unknown): Record<string, string> {
  return renderIndent(value)
}

/** Rendered attributes for one line height; "follow settings" renders nothing. */
export function blockLineHeightAttributes(value: unknown): Record<string, string> {
  return renderLineHeight(value)
}

/** True for the block nodes the extension covers. */
export function isFormattableBlock(name: string): boolean {
  return (BLOCK_TYPES as readonly string[]).includes(name)
}
