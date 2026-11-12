import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createEditorExtensions } from '../src/renderer/src/editor/core/extensions'
import { documentToMarkdown, normalizeAttachmentReference } from '../src/renderer/src/editor/core/markdown'
import { normalizeImageAlign, normalizeImageWidth } from '../src/renderer/src/editor/extensions/image'
import { attachmentReferenceFromAttrs, formatFileSize } from '../src/renderer/src/editor/extensions/attachment'
import type { TiptapDocument } from '../src/shared/document'

const editors: Editor[] = []

function createEditor(content?: TiptapDocument): Editor {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  })
  editors.push(editor)
  return editor
}

afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

describe('content modules', () => {
  it('inserts and restores images, attachments, tables, tasks and code blocks', () => {
    const imageEditor = createEditor()
    imageEditor.commands.insertContent({
      type: 'image',
      attrs: {
        src: 'shizhi-attachment://image-id.png',
        alt: '架构图',
        title: '架构图',
        width: '50',
        align: 'right',
      },
    })
    expect(JSON.stringify(imageEditor.getJSON())).toContain('"type":"image"')

    const attachmentEditor = createEditor()
    attachmentEditor.commands.insertContent({
      type: 'attachment',
      attrs: {
        id: 'attachment-id',
        name: '需求.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        url: 'shizhi-attachment://attachment-id.pdf',
      },
    })
    expect(JSON.stringify(attachmentEditor.getJSON())).toContain('"type":"attachment"')

    const content: TiptapDocument = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'shizhi-attachment://image-id.png',
            alt: '架构图',
            title: '架构图',
            width: '50',
            align: 'right',
          },
        },
        {
          type: 'attachment',
          attrs: {
            id: 'attachment-id',
            name: '需求.pdf',
            mimeType: 'application/pdf',
            size: 2048,
            url: 'shizhi-attachment://attachment-id.pdf',
          },
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '订单' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph' }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '任务一' }] }],
            },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    }
    const editor = createEditor(content)

    const json = editor.getJSON() as TiptapDocument
    const serialized = JSON.stringify(json)
    expect(serialized).toContain('"type":"image"')
    expect(serialized).toContain('"type":"attachment"')
    expect(serialized).toContain('"type":"table"')
    expect(serialized).toContain('"type":"codeBlock"')
    expect(serialized).toContain('"type":"taskList"')

    const restored = createEditor(JSON.parse(serialized) as TiptapDocument)
    expect(restored.getJSON()).toEqual(json)
    expect(restored.getAttributes('image').width).toBe('50')
    expect(restored.getAttributes('image').align).toBe('right')
  })

  it('supports task lists, dividers and table row operations', () => {
    const taskEditor = createEditor()
    taskEditor.commands.toggleTaskList()
    taskEditor.commands.insertContent({ type: 'text', text: '任务一' })
    expect(JSON.stringify(taskEditor.getJSON())).toContain('"type":"taskList"')

    const dividerEditor = createEditor()
    dividerEditor.commands.insertContent({ type: 'horizontalRule' })
    expect(JSON.stringify(dividerEditor.getJSON())).toContain('"type":"horizontalRule"')

    const tableEditor = createEditor()
    tableEditor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })
    tableEditor.commands.addRowAfter()
    const json = tableEditor.getJSON() as TiptapDocument
    const table = json.content.find((node) => node.type === 'table')
    expect(table?.content).toHaveLength(3)
  })

  it('normalizes image and attachment metadata', () => {
    expect(normalizeImageWidth('50')).toBe('50')
    expect(normalizeImageWidth('80')).toBe('100')
    expect(normalizeImageAlign('left')).toBe('left')
    expect(normalizeImageAlign('justify')).toBe('center')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(normalizeAttachmentReference({
      id: 'a1',
      name: '报告.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      url: 'shizhi-attachment://a1.pdf',
    })?.url).toBe('shizhi-attachment://a1.pdf')
    expect(normalizeAttachmentReference({ url: 'https://example.com/unsafe.pdf' })).toBeNull()
    expect(attachmentReferenceFromAttrs({
      id: 'a2', name: '图.png', mimeType: 'image/png', size: 10, url: 'shizhi-attachment://a2.png',
    })?.size).toBe(10)
  })
})

describe('markdown degradation', () => {
  it('degrades images, tables, tasks and attachments without losing their content', () => {
    const document: TiptapDocument = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '计划' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: true }, content: [
            { type: 'paragraph', content: [{ type: 'text', text: '完成审计' }] },
          ] },
        ] },
        { type: 'table', content: [
          { type: 'tableRow', content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '阶段' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '状态' }] }] },
          ] },
          { type: 'tableRow', content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'P3' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '完成' }] }] },
          ] },
        ] },
        { type: 'image', attrs: { src: 'shizhi-attachment://image.png', alt: '架构图' } },
        { type: 'attachment', attrs: { name: '需求.pdf', url: 'shizhi-attachment://file.pdf' } },
      ],
    }

    const markdown = documentToMarkdown(document)
    expect(markdown).toContain('## 计划')
    expect(markdown).toContain('- [x] 完成审计')
    expect(markdown).toContain('| 阶段 | 状态 |')
    expect(markdown).toContain('![架构图](shizhi-attachment://image.png)')
    expect(markdown).toContain('[附件：需求.pdf](shizhi-attachment://file.pdf)')
  })
})
