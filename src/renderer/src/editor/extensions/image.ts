import { mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'

export type ImageWidth = '25' | '50' | '75' | '100'
export type ImageAlign = 'left' | 'center' | 'right'

export const ShizhiImage = Image.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      width: {
        default: '100',
        parseHTML: (element) => normalizeImageWidth(element.getAttribute('data-width')),
        renderHTML: (attributes) => ({ 'data-width': normalizeImageWidth(attributes.width) }),
      },
      align: {
        default: 'center',
        parseHTML: (element) => normalizeImageAlign(element.getAttribute('data-align')),
        renderHTML: (attributes) => ({ 'data-align': normalizeImageAlign(attributes.align) }),
      },
    }
  },
  renderHTML({ HTMLAttributes }) {
    const width = normalizeImageWidth(HTMLAttributes['data-width'])
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        class: 'shizhi-image',
        'data-width': width,
        style: `width: ${width}%;`,
      }),
    ]
  },
}).configure({ inline: false, allowBase64: false })

export function normalizeImageWidth(value: unknown): ImageWidth {
  return value === '25' || value === '50' || value === '75' || value === '100'
    ? value
    : '100'
}

export function normalizeImageAlign(value: unknown): ImageAlign {
  return value === 'left' || value === 'right' ? value : 'center'
}
