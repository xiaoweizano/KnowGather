import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { importSources } from '../src/main/importers/importer'
import { htmlToDocument, isDocumentEmpty, dataUrlToBytes } from '../src/renderer/src/services/importService'
import type { TiptapNode } from '../src/shared/document'

const root = 'F:/codex-daily/.tmp-import-test'
const available = existsSync(`${root}/笔记.txt`)
// htmlToDocument needs a DOM (Tiptap's HTML parser uses DOMParser). The Node test
// environment has none, so those assertions only run where a DOM exists; the same
// chain is verified against the real Electron renderer separately.
const hasDom = typeof (globalThis as { DOMParser?: unknown }).DOMParser !== 'undefined'

function collectTypes(node: TiptapNode, acc: Set<string> = new Set()): Set<string> {
  acc.add(node.type)
  for (const child of node.content ?? []) collectTypes(child, acc)
  return acc
}

function collectText(node: TiptapNode, out: string[] = []): string[] {
  if (typeof node.text === 'string') out.push(node.text)
  for (const child of node.content ?? []) collectText(child, out)
  return out
}

describe.skipIf(!available || !hasDom)('import end-to-end: file bytes → editor document', () => {
  it('turns a Markdown file into structured editor content', async () => {
    const result = await importSources([{ path: `${root}/说明.md`, kind: 'file' }])
    expect(result.failures).toEqual([])

    const [imported] = result.documents
    const { document } = htmlToDocument(imported!.html)

    const types = collectTypes(document)
    expect(types.has('heading')).toBe(true)
    expect(types.has('bulletList')).toBe(true)
    expect(types.has('codeBlock')).toBe(true)
    expect(types.has('table')).toBe(true)

    const text = collectText(document).join('')
    expect(text).toContain('项目说明')
    expect(text).toContain('支持导入')

    // The front-matter title must win over the first heading.
    expect(imported!.title).toBe('项目说明文档')
  })

  it('turns a DOCX file into headings, bold text and a list', async () => {
    const result = await importSources([{ path: `${root}/合同.docx`, kind: 'file' }])
    expect(result.failures).toEqual([])

    const [imported] = result.documents
    const { document } = htmlToDocument(imported!.html)
    const types = collectTypes(document)

    expect(types.has('heading')).toBe(true)
    // A bold run becomes a text node carrying the bold mark.
    const boldText = JSON.stringify(document).includes('"type":"bold"')
    expect(boldText).toBe(true)
  })

  it('keeps GBK text intact through the whole chain', async () => {
    const result = await importSources([{ path: `${root}/历史的笔记.txt`, kind: 'file' }])
    const [imported] = result.documents
    expect(imported!.encoding).toBe('gb18030')

    const { document } = htmlToDocument(imported!.html)
    const text = collectText(document).join('')
    expect(text).toContain('历史记录')
    expect(text).toContain('这是GBK编码')
    expect(text).not.toContain('\uFFFD')
  })

  it('flattens a plain text file into paragraphs', async () => {
    const result = await importSources([{ path: `${root}/笔记.txt`, kind: 'file' }])
    const [imported] = result.documents
    const { document } = htmlToDocument(imported!.html)

    expect(isDocumentEmpty(document)).toBe(false)
    const text = collectText(document).join('')
    expect(text).toContain('会议记录')
    expect(text).toContain('下一个段落')
  })

  it('never produces an empty document for real content', async () => {
    const result = await importSources([
      { path: `${root}/笔记.txt`, kind: 'file' },
      { path: `${root}/说明.md`, kind: 'file' },
      { path: `${root}/合同.docx`, kind: 'file' },
      { path: `${root}/历史的笔记.txt`, kind: 'file' },
    ])

    for (const imported of result.documents) {
      const { document } = htmlToDocument(imported.html)
      expect(isDocumentEmpty(document), `${imported.sourceLabel} produced an empty document`).toBe(false)
    }
  })
})

describe('imported image handling', () => {
  it.skipIf(!hasDom)('lifts data-URL images out of the HTML', () => {
    const html = '<p>文字</p><img src="data:image/png;base64,iVBORw0KGgo=" alt="图">'
    const { document, embeddedImages } = htmlToDocument(html)

    expect(embeddedImages).toHaveLength(1)
    expect(embeddedImages[0]!.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    // The document must not keep an inline data URL.
    expect(JSON.stringify(document)).not.toContain('data:image')
  })

  it('decodes a data URL into bytes with a matching mime type', () => {
    const decoded = dataUrlToBytes('data:image/png;base64,aGVsbG8=')
    expect(decoded?.mimeType).toBe('image/png')
    expect(decoded?.extension).toBe('png')
    expect(Buffer.from(decoded!.bytes).toString()).toBe('hello')
  })

  it('returns null for a malformed data URL', () => {
    expect(dataUrlToBytes('data:image/png;base64')).toBeNull()
    expect(dataUrlToBytes('not-a-data-url')).toBeNull()
  })
})
