import { mergeAttributes, Node } from '@tiptap/core'
import type { AttachmentReference } from '@shared/document'

function readAttr(attributes: Record<string, unknown>, key: string): string {
  return typeof attributes[key] === 'string' ? attributes[key] : ''
}

export const Attachment = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null },
      name: { default: '附件' },
      mimeType: { default: 'application/octet-stream' },
      size: { default: 0 },
      url: { default: '' },
    }
  },
  parseHTML() {
    return [{ tag: 'a[data-attachment-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const attributes = HTMLAttributes as Record<string, unknown>
    const name = readAttr(attributes, 'name') || '附件'
    const href = readAttr(attributes, 'url')
    const size = typeof attributes.size === 'number' ? formatFileSize(attributes.size) : ''
    return [
      'a',
      mergeAttributes(attributes, {
        class: 'shizhi-attachment-card',
        'data-attachment-id': readAttr(attributes, 'id'),
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        download: name,
      }),
      name,
      size ? ` · ${size}` : '',
    ]
  },
})

export function attachmentReferenceFromAttrs(attributes: Record<string, unknown>): AttachmentReference | null {
  const id = readAttr(attributes, 'id')
  const name = readAttr(attributes, 'name')
  const mimeType = readAttr(attributes, 'mimeType')
  const url = readAttr(attributes, 'url')
  const size = typeof attributes.size === 'number' ? attributes.size : Number(attributes.size)
  if (!id || !name || !url.startsWith('shizhi-attachment://') || !Number.isFinite(size)) return null
  return {
    id,
    name,
    mimeType: mimeType || 'application/octet-stream',
    size,
    url: url as AttachmentReference['url'],
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
