import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { openZip } from '../src/main/importers/zip'
import { parseXml, textContent, childElements, firstChild, attributeOf } from '../src/main/importers/xml'
import { convertDocx } from '../src/main/importers/docx'
import { convertFile } from '../src/main/importers/importer'
import { decodeTextBuffer } from '../src/main/importers/encoding'
import { splitFrontMatter } from '../src/main/importers/importer'
import { plainTextToHtml } from '../src/main/importers/textFormats'

// ─── ZIP ──────────────────────────────────────────────────────────────────────

interface StoredEntry {
  name: string
  data: Buffer
  deflate: boolean
}

/** Builds a minimal but spec-correct ZIP with a central directory. */
function buildZip(entries: StoredEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const payload = entry.deflate ? deflateRawSync(entry.data) : entry.data
    const method = entry.deflate ? 8 : 0
    const crc = crc32(entry.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(local, nameBytes, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)

    offset += local.length + nameBytes.length + payload.length
  }

  const centralBuffer = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, centralBuffer, end])
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

describe('zip reader', () => {
  it('reads stored and deflated entries', () => {
    const archive = openZip(buildZip([
      { name: 'stored.txt', data: Buffer.from('纯文本内容'), deflate: false },
      { name: 'deflated.txt', data: Buffer.from('压缩内容'.repeat(20)), deflate: true },
    ]))

    expect(archive.listNames()).toEqual(['stored.txt', 'deflated.txt'])
    expect(archive.readText('stored.txt')).toBe('纯文本内容')
    expect(archive.readText('deflated.txt')).toBe('压缩内容'.repeat(20))
    expect(archive.read('missing.txt')).toBeNull()
  })

  it('rejects data that is not a zip archive', () => {
    expect(() => openZip(Buffer.from('not a zip file at all'))).toThrow(/ZIP/)
  })

  it('rejects a truncated archive', () => {
    const valid = buildZip([{ name: 'a.txt', data: Buffer.from('x'), deflate: false }])
    expect(() => openZip(valid.subarray(0, valid.length - 30))).toThrow()
  })
})

// ─── XML ──────────────────────────────────────────────────────────────────────

describe('xml parser', () => {
  it('parses elements, attributes, text and entities', () => {
    const root = parseXml(`<?xml version="1.0"?>
      <w:document xmlns:w="http://example.com">
        <w:body>
          <w:p><w:r><w:t>你好 &amp; 世界</w:t></w:r></w:p>
        </w:body>
      </w:document>`)

    const body = firstChild(root, 'body')
    expect(body).not.toBeNull()
    const paragraph = childElements(body!, 'p')[0]!
    const run = firstChild(paragraph, 'r')!
    const text = firstChild(run, 't')!
    expect(textContent(text)).toBe('你好 & 世界')
  })

  it('reads namespaced attributes by local name', () => {
    const root = parseXml('<w:p w:val="x" xml:space="preserve"></w:p>')
    expect(attributeOf(root, 'val')).toBe('x')
    expect(attributeOf(root, 'space')).toBe('preserve')
  })

  it('rejects mismatched tags instead of guessing', () => {
    expect(() => parseXml('<a><b></a></b>')).toThrow(/不匹配/)
    expect(() => parseXml('<a><b></b>')).toThrow()
  })
})

// ─── DOCX ─────────────────────────────────────────────────────────────────────

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function buildDocx(options: { body: string; styles?: string; numbering?: string }): Buffer {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}"><w:body>${options.body}</w:body></w:document>`

  const entries: StoredEntry[] = [
    { name: 'word/document.xml', data: Buffer.from(document), deflate: true },
    {
      name: 'word/_rels/document.xml.rels',
      data: Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="hyperlink" Target="https://example.com"/>
      </Relationships>`),
      deflate: true,
    },
  ]

  if (options.styles) {
    entries.push({ name: 'word/styles.xml', data: Buffer.from(options.styles), deflate: true })
  }
  if (options.numbering) {
    entries.push({ name: 'word/numbering.xml', data: Buffer.from(options.numbering), deflate: true })
  }

  return buildZip(entries)
}

describe('docx conversion', () => {
  it('converts headings, paragraphs and inline formatting', () => {
    const docx = buildDocx({
      body: `
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章</w:t></w:r></w:p>
        <w:p><w:r><w:t xml:space="preserve">普通 </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>粗体</w:t></w:r></w:p>`,
      styles: `<w:styles xmlns:w="${WORD_NS}">
        <w:style w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
      </w:styles>`,
    })

    const result = convertDocx(docx)
    expect(result.html).toContain('<h1>第一章</h1>')
    expect(result.html).toContain('<p>普通 <strong>粗体</strong></p>')
    expect(result.title).toBe('第一章')
  })

  it('recognises Chinese heading style names when no outline level is set', () => {
    const docx = buildDocx({
      body: `<w:p><w:pPr><w:pStyle w:val="2"/></w:pPr><w:r><w:t>小节</w:t></w:r></w:p>`,
      styles: `<w:styles xmlns:w="${WORD_NS}">
        <w:style w:styleId="2"><w:name w:val="标题 2"/></w:style>
      </w:styles>`,
    })

    expect(convertDocx(docx).html).toContain('<h2>小节</h2>')
  })

  it('renders bullet lists and keeps item text', () => {
    const docx = buildDocx({
      body: `
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>第一项</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>第二项</w:t></w:r></w:p>`,
      numbering: `<w:numbering xmlns:w="${WORD_NS}">
        <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>
        <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
      </w:numbering>`,
    })

    const html = convertDocx(docx).html
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>第一项</li>')
    expect(html).toContain('<li>第二项</li>')
    expect(html).toContain('</ul>')
  })

  it('renders tables with cells', () => {
    const docx = buildDocx({
      body: `<w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>姓名</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>分数</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>张三</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>90</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>`,
    })

    const html = convertDocx(docx).html
    expect(html).toContain('<table>')
    expect(html).toContain('<td>姓名</td>')
    expect(html).toContain('<td>90</td>')
  })

  it('turns hyperlink relationships into anchors', () => {
    const docx = buildDocx({
      body: `<w:p><w:hyperlink r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <w:r><w:t>链接</w:t></w:r></w:hyperlink></w:p>`,
    })

    expect(convertDocx(docx).html).toContain('<a href="https://example.com">链接</a>')
  })

  it('fails loudly for a file that is not a docx', () => {
    expect(() => convertDocx(Buffer.from('plain text'))).toThrow()
    // A zip without word/document.xml is not a Word document.
    expect(() => convertDocx(buildZip([{ name: 'other.xml', data: Buffer.from('<x/>'), deflate: false }])))
      .toThrow(/Word/)
  })
})

describe('word package validation', () => {
  // Encrypted Office files and legacy .doc are OLE compound documents.
  const oleBytes = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(504),
  ])

  it('reports an encrypted docx as password-protected rather than corrupt', () => {
    expect(() => convertFile('工资表.docx', '工资表', oleBytes))
      .toThrow(/加密|密码保护/)
  })

  it('explains that legacy .doc must be re-saved as .docx', () => {
    expect(() => convertFile('旧合同.doc', '旧合同', oleBytes))
      .toThrow(/另存为 \.docx/)
  })

  it('reports a truncated docx as damaged', () => {
    expect(() => convertFile('坏的.docx', '坏的', Buffer.from('not a zip archive')))
      .toThrow(/损坏|有效/)
  })

  it('still imports a valid docx package', () => {
    const docx = buildDocx({ body: '<w:p><w:r><w:t>正文</w:t></w:r></w:p>' })
    const imported = convertFile('正常.docx', '正常', docx)
    expect(imported.format).toBe('docx')
    expect(imported.html).toContain('正文')
  })
})

// ─── Encoding ─────────────────────────────────────────────────────────────────

describe('text decoding', () => {
  it('detects UTF-8 including the BOM', () => {
    expect(decodeTextBuffer(Buffer.from('中文内容', 'utf8'))).toEqual({ text: '中文内容', encoding: 'utf-8' })
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('带 BOM', 'utf8')])
    expect(decodeTextBuffer(withBom).text).toBe('带 BOM')
  })

  it('detects UTF-16LE by its BOM', () => {
    const encoded = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('十六位', 'utf16le')])
    const result = decodeTextBuffer(encoded)
    expect(result.text).toBe('十六位')
    expect(result.encoding).toBe('utf-16le')
  })

  it('falls back to GB18030 for legacy Chinese text', () => {
    // "中文" encoded as GBK.
    const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])
    const result = decodeTextBuffer(gbk)
    expect(result.text).toBe('中文')
    expect(result.encoding).toBe('gb18030')
  })

  it('handles an empty buffer', () => {
    expect(decodeTextBuffer(Buffer.alloc(0))).toEqual({ text: '', encoding: 'utf-8' })
  })
})

// ─── Front matter ─────────────────────────────────────────────────────────────

describe('markdown front matter', () => {
  it('extracts a title and strips the block', () => {
    const { frontMatter, body } = splitFrontMatter('---\ntitle: 我的笔记\ntags: 随手记\n---\n正文内容')
    expect(frontMatter.title).toBe('我的笔记')
    expect(frontMatter.tags).toBe('随手记')
    expect(body).toBe('正文内容')
  })

  it('leaves text without front matter untouched', () => {
    const { frontMatter, body } = splitFrontMatter('# 标题\n正文')
    expect(frontMatter).toEqual({})
    expect(body).toBe('# 标题\n正文')
  })
})

// ─── Plain text ───────────────────────────────────────────────────────────────

describe('plain text conversion', () => {
  it('splits paragraphs on blank lines and escapes markup', () => {
    const html = plainTextToHtml('第一段\n同一段第二行\n\n第二段 <script>')
    expect(html).toContain('<p>第一段<br>同一段第二行</p>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})
