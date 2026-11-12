import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'hr', 'span',
] as const

const ALLOWED_ATTRIBUTES = [
  'href', 'title', 'src', 'alt', 'width', 'height',
  'colspan', 'rowspan', 'start', 'type', 'checked', 'disabled',
  'data-type', 'data-checked', 'data-align', 'data-width',
] as const

const SAFE_URI = /^(?:(?:https?|mailto|tel|shizhi-attachment):|[/#?]|\.{1,2}\/|[^a-z+.-]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
const DANGEROUS_BLOCK = /<(script|style|noscript|iframe|object|embed|form|textarea|select|button|head|meta|link)[^>]*>[\s\S]*?<\/\1\s*>/gi
const DANGEROUS_SINGLE = /<\/?(?:script|style|noscript|iframe|object|embed|form|textarea|select|button|head|meta|link|input)[^>]*>/gi
const DATA_IMAGE_URI = /\bdata:image\/[^\s"'<>]*/gi
const TAG_TOKEN = /<\/?([a-z][\w:-]*)(?:\s[^<>]*?)?\/?>/gi
const ATTRIBUTE_TOKEN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
const allowedTags = new Set<string>(ALLOWED_TAGS)
const allowedAttributes = new Set<string>(ALLOWED_ATTRIBUTES)

/**
 * ProseMirror receives this before its own paste parser runs. DOMPurify is the
 * primary sanitizer in Electron; the small DOM-free fallback keeps the same
 * allowlist testable in the Node Vitest environment.
 */
export function sanitizeClipboardHtml(html: string): string {
  const prepared = prepareClipboardHtml(html)
  if (!DOMPurify.isSupported) return sanitizeWithoutDom(prepared)

  return String(DOMPurify.sanitize(prepared, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTRIBUTES],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: SAFE_URI,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['style', 'class', 'id', 'onerror', 'onload', 'onclick'],
  }))
}

export function prepareClipboardHtml(html: string): string {
  return html
    .replace(DATA_IMAGE_URI, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(DANGEROUS_BLOCK, '')
    .replace(DANGEROUS_SINGLE, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<\/?o:p[^>]*>/gi, '')
}

function sanitizeWithoutDom(html: string): string {
  let output = ''
  let cursor = 0

  for (const match of html.matchAll(TAG_TOKEN)) {
    const index = match.index ?? 0
    output += html.slice(cursor, index)
    output += sanitizeTag(match[0], match[1] ?? '')
    cursor = index + match[0].length
  }

  output += html.slice(cursor)
  return output
}

function sanitizeTag(rawTag: string, rawName: string): string {
  const name = rawName.toLowerCase()
  if (!allowedTags.has(name)) return ''
  if (rawTag.startsWith('</')) return `</${name}>`

  const attributes: string[] = []
  const attributeSource = rawTag
    .replace(/^<[a-z][\w:-]*/i, '')
    .replace(/\/?>$/, '')

  for (const match of attributeSource.matchAll(ATTRIBUTE_TOKEN)) {
    const namePart = (match[1] ?? '').toLowerCase()
    if (!allowedAttributes.has(namePart)) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (namePart === 'href' || namePart === 'src') {
      const safe = sanitizeUri(value, name, namePart)
      if (safe === null) continue
      attributes.push(`${namePart}="${escapeAttribute(safe)}"`)
      continue
    }
    if (namePart === 'checked' || namePart === 'disabled') {
      attributes.push(namePart)
      continue
    }
    if (namePart === 'width' || namePart === 'height') {
      if (/^(?:\d{1,5}|\d{1,3}%)$/.test(value.trim())) {
        attributes.push(`${namePart}="${value.trim()}"`)
      }
      continue
    }
    if (namePart === 'colspan' || namePart === 'rowspan') {
      if (/^\d{1,3}$/.test(value.trim())) attributes.push(`${namePart}="${value.trim()}"`)
      continue
    }
    if (namePart === 'data-width') {
      if (['25', '50', '75', '100'].includes(value.trim())) attributes.push(`data-width="${value.trim()}"`)
      continue
    }
    if (namePart === 'data-align') {
      if (['left', 'center', 'right'].includes(value.trim())) attributes.push(`data-align="${value.trim()}"`)
      continue
    }
    if (namePart === 'data-type') {
      if (['taskList', 'taskItem'].includes(value.trim())) attributes.push(`data-type="${value.trim()}"`)
      continue
    }
    if (namePart === 'data-checked') {
      if (value.trim() === 'true' || value.trim() === 'false') attributes.push(`data-checked="${value.trim()}"`)
      continue
    }
    attributes.push(`${namePart}="${escapeAttribute(value)}"`)
  }

  const isVoid = ['br', 'img', 'hr'].includes(name)
  return `<${name}${attributes.length ? ` ${attributes.join(' ')}` : ''}${isVoid ? ' />' : '>'}`
}

function sanitizeUri(value: string, tagName: string, attributeName: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (attributeName === 'src' && tagName !== 'img') return null

  const decoded = decodeNumericEntities(trimmed).replace(/[\u0000-\u0020]+/g, '')
  if (/^(?:javascript|vbscript|data):/i.test(decoded)) return null
  if (!SAFE_URI.test(decoded) && /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null
  return trimmed
}

function decodeNumericEntities(value: string): string {
  return value.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_match, hex: string, decimal: string) => {
    const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10)
    return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ''
  })
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
