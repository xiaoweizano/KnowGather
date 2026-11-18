import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'

const root = 'F:/codex-daily/.tmp-import-test'
mkdirSync(`${root}/folder/子目录`, { recursive: true })

// 1. UTF-8 纯文本
writeFileSync(`${root}/笔记.txt`, '会议记录\n\n这次讨论了导入功能的实现方案。\n第二行内容。\n\n下一个段落。', 'utf8')

// 2. GBK 编码的中文文本（历史笔记常见编码）
const gbkBytes = Buffer.from([
  0xc0, 0xfa, 0xca, 0xb7, 0xbc, 0xc7, 0xc2, 0xbc, // 历史记录
  0x0a, 0x0a,
  0xd5, 0xe2, 0xca, 0xc7, 0x47, 0x42, 0x4b, 0xb1, 0xe0, 0xc2, 0xeb, // 这是GBK编码
])
writeFileSync(`${root}/历史的笔记.txt`, gbkBytes)

// 3. Markdown
writeFileSync(`${root}/说明.md`, `---
title: 项目说明文档
---
# 项目说明

这是一个 **Markdown** 文件，包含 *斜体* 和 \`代码\`。

## 功能列表

- 支持导入
- 支持导出
- [ ] 待办事项

\`\`\`js
console.log('hello')
\`\`\`

| 名称 | 状态 |
| --- | --- |
| 导入 | 完成 |
`, 'utf8')

// 4. DOCX
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}"><w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Word 文档标题</w:t></w:r></w:p>
  <w:p><w:r><w:t>这是从 Word 导入的正文段落。</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>加粗的文字</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>列表项一</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>列表项二</w:t></w:r></w:p>
</w:body></w:document>`

const stylesXml = `<?xml version="1.0"?><w:styles xmlns:w="${WORD_NS}">
  <w:style w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
</w:styles>`

const numberingXml = `<?xml version="1.0"?><w:numbering xmlns:w="${WORD_NS}">
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function buildZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data)
    const payload = deflateRawSync(data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(local, nameBytes, payload)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(data.length, 24)
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

const docx = buildZip([
  { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
  { name: 'word/document.xml', data: documentXml },
  { name: 'word/styles.xml', data: stylesXml },
  { name: 'word/numbering.xml', data: numberingXml },
  { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
])
writeFileSync(`${root}/合同.docx`, docx)

// 5. 文件夹内容
writeFileSync(`${root}/folder/日记一.md`, '# 日记一\n\n今天开始整理笔记。', 'utf8')
writeFileSync(`${root}/folder/子目录/日记二.txt`, '日记二的内容，位于子目录中。', 'utf8')
writeFileSync(`${root}/folder/忽略我.json`, '{"ignored": true}', 'utf8')

// 6. zip 压缩包
const archive = buildZip([
  { name: '归档/旧笔记.md', data: '---\ntitle: 归档笔记\n---\n# 归档笔记\n\n来自压缩包的内容。' },
  { name: '归档/纯文本.txt', data: '压缩包里的纯文本文件。' },
])
writeFileSync(`${root}/归档.zip`, archive)

console.log('测试文件已创建:')
console.log('  .tmp-import-test/笔记.txt')
console.log('  .tmp-import-test/历史的笔记.txt  (GBK)')
console.log('  .tmp-import-test/说明.md')
console.log('  .tmp-import-test/合同.docx')
console.log('  .tmp-import-test/folder/ (含子目录)')
console.log('  .tmp-import-test/归档.zip')
