import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { importSources } from '../src/main/importers/importer'

const root = 'F:/codex-daily/.tmp-import-test'
const available = existsSync(`${root}/笔记.txt`)

describe.skipIf(!available)('import pipeline against real files', () => {
  it('imports a mixed set of files', async () => {
    const result = await importSources([
      { path: `${root}/笔记.txt`, kind: 'file' },
      { path: `${root}/历史的笔记.txt`, kind: 'file' },
      { path: `${root}/说明.md`, kind: 'file' },
      { path: `${root}/合同.docx`, kind: 'file' },
    ])

    console.log('documents:', result.documents.map((d) => ({
      title: d.title,
      format: d.format,
      encoding: d.encoding,
      source: d.sourceLabel,
      text: d.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
      warnings: d.warnings,
    })))
    console.log('failures:', result.failures)

    expect(result.failures).toEqual([])
    expect(result.documents).toHaveLength(4)

    const txt = result.documents.find((d) => d.sourceLabel === '笔记.txt')!
    expect(txt.format).toBe('text')
    expect(txt.html).toContain('会议记录')
    expect(txt.html).toContain('<p>下一个段落。</p>')

    const gbk = result.documents.find((d) => d.sourceLabel === '历史的笔记.txt')!
    expect(gbk.encoding).toBe('gb18030')
    expect(gbk.html).toContain('历史记录')
    expect(gbk.html).toContain('这是GBK编码')

    const md = result.documents.find((d) => d.sourceLabel === '说明.md')!
    expect(md.format).toBe('markdown')
    expect(md.title).toBe('项目说明文档')
    expect(md.html).toContain('<h1>项目说明</h1>')
    expect(md.html).toContain('<strong>Markdown</strong>')
    expect(md.html).toContain('<pre><code')
    expect(md.html).toContain('<table>')

    const docx = result.documents.find((d) => d.sourceLabel === '合同.docx')!
    expect(docx.format).toBe('docx')
    expect(docx.html).toContain('<h1>Word 文档标题</h1>')
    expect(docx.html).toContain('<strong>加粗的文字</strong>')
    expect(docx.html).toContain('<ul>')
  })

  it('walks a folder recursively and skips unsupported files', async () => {
    const result = await importSources([{ path: `${root}/folder`, kind: 'folder' }])
    console.log('folder documents:', result.documents.map((d) => d.sourceLabel))

    expect(result.failures).toEqual([])
    expect(result.documents.map((d) => d.sourceLabel).sort()).toEqual(['日记一.md', '子目录/日记二.txt'].sort())
    expect(result.documents.some((d) => d.html.includes('日记二的内容'))).toBe(true)
  })

  it('expands a zip archive', async () => {
    const result = await importSources([{ path: `${root}/归档.zip`, kind: 'archive' }])
    console.log('archive documents:', result.documents.map((d) => d.sourceLabel))

    expect(result.failures).toEqual([])
    expect(result.documents).toHaveLength(2)
    expect(result.documents.some((d) => d.title === '归档笔记')).toBe(true)
    expect(result.documents.some((d) => d.html.includes('压缩包里的纯文本'))).toBe(true)
  })

  it('reports a missing file as a per-file failure', async () => {
    const result = await importSources([{ path: `${root}/不存在.txt`, kind: 'file' }])
    expect(result.documents).toHaveLength(0)
    expect(result.failures).toHaveLength(1)
  })
})
