import { describe, expect, it } from 'vitest'
import { insertAiReplyIntoDocument, markdownToNodes } from '../src/renderer/src/app/assistantInsert'
import { EMPTY_DOCUMENT, type TiptapDocument } from '../src/shared/document'

describe('assistant reply formatting', () => {
  it('maps headings, lists, quotes and fenced code onto editor nodes', () => {
    const nodes = markdownToNodes([
      '## 计划',
      '',
      '- 第一条',
      '- 第二条',
      '',
      '1. 步骤一',
      '',
      '> 引用一句话',
      '',
      '```ts',
      'const a = 1',
      '```',
    ].join('\n'))

    expect(nodes.map((node) => node.type)).toEqual([
      'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock',
    ])
    expect(nodes[0]!.attrs).toEqual({ level: 2 })
    expect(nodes[4]!.attrs).toEqual({ language: 'ts' })
  })

  it('keeps plain prose as paragraphs and joins wrapped lines with hard breaks', () => {
    const nodes = markdownToNodes('第一行\n第二行\n\n另一个段落')
    expect(nodes).toHaveLength(2)
    expect(nodes[0]!.content!.map((node) => node.type)).toEqual(['text', 'hardBreak', 'text'])
  })

  it('appends the reply to the document and leaves a trailing paragraph', () => {
    const document: TiptapDocument = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '原文' }] }] }
    const next = insertAiReplyIntoDocument(document, 'Hello\n\nWorld')
    expect(next.content[0]).toEqual(document.content[0])
    expect(next.content.slice(1).map((node) => node.type)).toEqual(['paragraph', 'paragraph', 'paragraph'])
    // The source document is not mutated.
    expect(document.content).toHaveLength(1)
  })

  it('is a no-op for an empty reply', () => {
    expect(insertAiReplyIntoDocument(EMPTY_DOCUMENT, '   ')).toEqual(EMPTY_DOCUMENT)
  })
})
