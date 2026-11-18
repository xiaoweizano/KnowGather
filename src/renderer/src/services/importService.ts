import { generateJSON } from '@tiptap/core'
import type { TiptapDocument } from '../../../shared/document'
import { createEditorExtensions } from '../editor/core/extensions'
import { sanitizeClipboardHtml } from '../editor/core/clipboardSanitizer'

/**
 * Converts imported HTML into an editor document.
 *
 * The HTML comes from Word or Markdown, so it goes through the same sanitizer as
 * pasted content before Tiptap parses it — an imported file must not be able to
 * inject markup the paste path would reject.
 */

let cachedExtensions: ReturnType<typeof createEditorExtensions> | null = null

function extensions(): ReturnType<typeof createEditorExtensions> {
  cachedExtensions ??= createEditorExtensions()
  return cachedExtensions
}

export interface HtmlToDocumentResult {
  document: TiptapDocument
  /** Inline data: URLs extracted from the HTML, keyed by their placeholder. */
  embeddedImages: Array<{ placeholder: string; dataUrl: string }>
}

/**
 * Parses HTML to a Tiptap document. Inline `data:` images cannot be stored in a
 * document (they bloat the JSON and are rejected by the attachment pipeline), so
 * they are lifted out and returned separately for the caller to persist.
 */
export function htmlToDocument(html: string): HtmlToDocumentResult {
  const embeddedImages: HtmlToDocumentResult['embeddedImages'] = []
  const stripped = html.replace(
    /src="data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)"/gi,
    (_match, _mime: string, base64: string) => {
      const placeholder = `shizhi-imported-image:${embeddedImages.length}`
      embeddedImages.push({ placeholder, dataUrl: `data:${_mime};base64,${base64.replace(/\s/g, '')}` })
      return `src="${placeholder}"`
    },
  )

  const sanitized = sanitizeClipboardHtml(stripped)
  const json = generateJSON(sanitized, extensions()) as TiptapDocument
  const document = normalizeImportedDocument(json)

  return { document, embeddedImages }
}

/**
 * Tiptap can emit an empty document for markup it does not understand. Imported
 * content must never vanish silently, so this guarantees at least one node and
 * rejects a document that lost everything.
 */
function normalizeImportedDocument(json: TiptapDocument): TiptapDocument {
  if (!json || json.type !== 'doc' || !Array.isArray(json.content) || json.content.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }
  return json
}

/** True when the parsed document carries no text and no meaningful nodes. */
export function isDocumentEmpty(document: TiptapDocument): boolean {
  let meaningful = false
  const visit = (node: { type?: string; text?: string; content?: unknown[] }): void => {
    if (meaningful) return
    if (typeof node.text === 'string' && node.text.trim()) {
      meaningful = true
      return
    }
    if (node.type === 'image' || node.type === 'attachment' || node.type === 'table' || node.type === 'horizontalRule') {
      meaningful = true
      return
    }
    for (const child of (node.content ?? []) as Array<{ type?: string; text?: string; content?: unknown[] }>) {
      visit(child)
    }
  }
  visit(document)
  return !meaningful
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mimeType: string; extension: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (!match) return null
  const mimeType = match[1]!.toLowerCase()
  const base64 = match[2]!.replace(/\s/g, '')
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return { bytes, mimeType, extension: extensionForMime(mimeType) }
  } catch {
    return null
  }
}

export function extensionForMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/tiff': 'tiff',
  }
  return map[mimeType] ?? 'png'
}
