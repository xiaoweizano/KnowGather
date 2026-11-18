import { openZip } from './zip.js'
import {
  attributeOf,
  childElements,
  findFirstChild,
  firstChild,
  localNameOf,
  parseXml,
  textContent,
  type XmlElement,
} from './xml.js'

/**
 * Converts a .docx package into semantic HTML.
 *
 * The renderer turns HTML into an editor document, so this only has to produce
 * correct structure — headings, lists, tables, emphasis, links and images — and
 * escape everything else. Unsupported constructs degrade to their text content
 * instead of being dropped silently.
 */

export interface DocxConversion {
  html: string
  title: string
  warnings: string[]
}

const WORD_NAMESPACE_MARK = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

export function convertDocx(buffer: Buffer): DocxConversion {
  const archive = openZip(buffer)

  const documentXml = archive.readText('word/document.xml')
  if (!documentXml) throw new Error('不是有效的 Word 文档：缺少 word/document.xml')

  const warnings: string[] = []
  const relationships = readRelationships(archive, warnings)
  const styleMap = readStyles(archive, warnings)
  const numberingMap = readNumbering(archive, warnings)
  const root = parseXml(documentXml)
  const body = firstChild(root, 'body')
  if (!body) throw new Error('Word 文档结构无效：缺少 body')

  const context: RenderContext = {
    relationships,
    styleMap,
    numberingMap,
    media: new Map(),
    imageCounter: 0,
    warnings,
  }

  extractMedia(archive, context)

  const html = renderBlocks(body, context)
  const title = readCoreTitle(archive) || firstNonEmptyLine(html)

  return { html, title, warnings }
}

interface RenderContext {
  relationships: Map<string, Relationship>
  styleMap: Map<string, StyleInfo>
  numberingMap: Map<string, NumberingInfo>
  media: Map<string, Buffer>
  imageCounter: number
  warnings: string[]
}

interface Relationship {
  type: string
  target: string
}

interface StyleInfo {
  name: string
  basedOn: string | null
  /** Resolved heading level from the paragraph style, or null. */
  headingLevel: number | null
  bold: boolean
  italic: boolean
}

interface NumberingInfo {
  /** Abstract numbering id this concrete numbering points at. */
  abstractId: string | null
  levels: Map<number, NumberingLevel>
}

interface NumberingLevel {
  format: string
  text: string
  start: number
}

// ─── Relationships ────────────────────────────────────────────────────────────

function readRelationships(archive: ReturnType<typeof openZip>, warnings: string[]): Map<string, Relationship> {
  const result = new Map<string, Relationship>()
  const xml = archive.readText('word/_rels/document.xml.rels')
  if (!xml) return result

  try {
    const root = parseXml(xml)
    for (const element of childElements(root, 'Relationship')) {
      const id = element.attributes.Id
      const target = element.attributes.Target
      const type = element.attributes.Type
      if (!id || !target) continue
      result.set(id, { type: type ?? '', target })
    }
  } catch (error) {
    warnings.push(`无法解析文档关系表：${messageOf(error)}`)
  }
  return result
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function readStyles(archive: ReturnType<typeof openZip>, warnings: string[]): Map<string, StyleInfo> {
  const result = new Map<string, StyleInfo>()
  const xml = archive.readText('word/styles.xml')
  if (!xml) return result

  try {
    const root = parseXml(xml)
    const raw = new Map<string, { info: StyleInfo; styleId: string }>()

    for (const style of childElements(root, 'style')) {
      const styleId = attributeOf(style, 'styleId')
      if (!styleId) continue
      const name = attributeOf(firstChild(style, 'name') ?? style, 'val') ?? ''
      const basedOn = firstChild(style, 'basedOn')
      const runProperties = firstChild(style, 'rPr')
      const paragraphProperties = firstChild(style, 'pPr')
      const outline = paragraphProperties ? firstChild(paragraphProperties, 'outlineLvl') : null

      const info: StyleInfo = {
        name,
        basedOn: basedOn ? attributeOf(basedOn, 'val') : null,
        headingLevel: null,
        bold: hasTruthyProperty(runProperties, 'b'),
        italic: hasTruthyProperty(runProperties, 'i'),
      }

      const outlineValue = outline ? Number.parseInt(attributeOf(outline, 'val') ?? '', 10) : Number.NaN
      if (Number.isFinite(outlineValue) && outlineValue >= 0 && outlineValue <= 8) {
        info.headingLevel = outlineValue + 1
      } else {
        info.headingLevel = headingLevelFromName(name)
      }

      raw.set(styleId, { info, styleId })
    }

    // Resolve inheritance so a style based on 标题 1 keeps its heading level.
    const resolve = (styleId: string, seen = new Set<string>()): StyleInfo | null => {
      const entry = raw.get(styleId)
      if (!entry || seen.has(styleId)) return null
      seen.add(styleId)
      if (entry.info.headingLevel !== null) return entry.info
      if (entry.info.basedOn) {
        const parent = resolve(entry.info.basedOn, seen)
        if (parent?.headingLevel != null) return { ...entry.info, headingLevel: parent.headingLevel }
      }
      return entry.info
    }

    for (const [styleId, entry] of raw) {
      result.set(styleId, resolve(styleId) ?? entry.info)
    }
  } catch (error) {
    warnings.push(`无法解析文档样式：${messageOf(error)}`)
  }

  return result
}

function headingLevelFromName(name: string): number | null {
  const normalized = name.trim()
  const english = normalized.match(/^heading\s*(\d+)$/i)
  if (english) return clampHeadingLevel(Number.parseInt(english[1]!, 10))
  // Chinese Word names heading styles 标题 1 … 标题 9.
  const chinese = normalized.match(/^标题\s*(\d+)$/)
  if (chinese) return clampHeadingLevel(Number.parseInt(chinese[1]!, 10))
  if (/^(title)$/i.test(normalized)) return 1
  return null
}

function clampHeadingLevel(level: number): number {
  return Math.min(6, Math.max(1, level))
}

function hasTruthyProperty(properties: XmlElement | null, localName: string): boolean {
  if (!properties) return false
  const element = firstChild(properties, localName)
  if (!element) return false
  const value = attributeOf(element, 'val')
  return value === null || !/^(?:0|false|off)$/i.test(value)
}

// ─── Numbering ────────────────────────────────────────────────────────────────

function readNumbering(archive: ReturnType<typeof openZip>, warnings: string[]): Map<string, NumberingInfo> {
  const result = new Map<string, NumberingInfo>()
  const xml = archive.readText('word/numbering.xml')
  if (!xml) return result

  try {
    const root = parseXml(xml)
    const abstracts = new Map<string, Map<number, NumberingLevel>>()

    for (const abstract of childElements(root, 'abstractNum')) {
      const abstractId = attributeOf(abstract, 'abstractNumId')
      if (!abstractId) continue
      const levels = new Map<number, NumberingLevel>()
      for (const level of childElements(abstract, 'lvl')) {
        const index = Number.parseInt(attributeOf(level, 'ilvl') ?? '0', 10)
        if (!Number.isFinite(index)) continue
        const formatElement = firstChild(level, 'numFmt')
        const textElement = firstChild(level, 'lvlText')
        const startElement = firstChild(level, 'start')
        levels.set(index, {
          format: formatElement ? attributeOf(formatElement, 'val') ?? 'decimal' : 'decimal',
          text: textElement ? attributeOf(textElement, 'val') ?? '' : '',
          start: startElement ? Number.parseInt(attributeOf(startElement, 'val') ?? '1', 10) || 1 : 1,
        })
      }
      abstracts.set(abstractId, levels)
    }

    for (const num of childElements(root, 'num')) {
      const numId = attributeOf(num, 'numId')
      if (!numId) continue
      const abstractRef = firstChild(num, 'abstractNumId')
      const abstractId = abstractRef ? attributeOf(abstractRef, 'val') : null
      result.set(numId, {
        abstractId,
        levels: (abstractId && abstracts.get(abstractId)) || new Map(),
      })
    }
  } catch (error) {
    warnings.push(`无法解析文档编号定义：${messageOf(error)}`)
  }

  return result
}

// ─── Media ────────────────────────────────────────────────────────────────────

function extractMedia(archive: ReturnType<typeof openZip>, context: RenderContext): void {
  for (const name of archive.listNames()) {
    if (!name.startsWith('word/media/')) continue
    const data = archive.read(name)
    if (data) context.media.set(name, data)
  }
}

// ─── Block rendering ──────────────────────────────────────────────────────────

function renderBlocks(body: XmlElement, context: RenderContext): string {
  // Walk the body in document order so paragraphs and tables keep their
  // interleaving.
  const output: string[] = []
  const listStack: ListFrame[] = []

  for (const child of body.children) {
    if (typeof child === 'string') continue
    const name = localNameOf(child.name)

    if (name === 'p') {
      output.push(renderParagraphWithLists(child, context, listStack))
      continue
    }

    if (name === 'tbl') {
      output.push(...closeListStack(listStack))
      output.push(renderTable(child, context))
    }
  }

  output.push(...closeListStack(listStack))
  return output.join('')
}

interface ListFrame {
  level: number
  ordered: boolean
}

/** Closes every open list item and list, innermost first. */
function closeListStack(stack: ListFrame[]): string[] {
  const output: string[] = []
  while (stack.length) {
    stack.pop()
    output.push('</li></ul>')
  }
  return output
}

/**
 * Renders a paragraph, opening and closing list containers around it so a flat
 * sequence of `w:p` elements becomes nested list markup. Word stores list items
 * as ordinary paragraphs carrying `w:numPr`, so the nesting has to be inferred
 * from the level numbers rather than from the XML tree.
 */
function renderParagraphWithLists(paragraph: XmlElement, context: RenderContext, stack: ListFrame[]): string {
  const properties = firstChild(paragraph, 'pPr')
  const numberingProperties = properties ? firstChild(properties, 'numPr') : null

  if (!numberingProperties) {
    const closed = closeListStack(stack).join('')
    return closed + renderParagraph(paragraph, context)
  }

  const numIdElement = firstChild(numberingProperties, 'numId')
  const levelElement = firstChild(numberingProperties, 'ilvl')
  const numId = numIdElement ? attributeOf(numIdElement, 'val') ?? '' : ''
  const level = levelElement ? Number.parseInt(attributeOf(levelElement, 'val') ?? '0', 10) || 0 : 0

  // numId "0" explicitly removes numbering from a paragraph.
  if (!numId || numId === '0') {
    return closeListStack(stack).join('') + renderParagraph(paragraph, context)
  }

  const numbering = context.numberingMap.get(numId)
  const levelInfo = numbering?.levels.get(level)
  const ordered = levelInfo ? !/bullet|none/i.test(levelInfo.format) : false

  let html = ''
  while (stack.length && stack[stack.length - 1]!.level > level) {
    stack.pop()
    html += '</li></ul>'
  }

  const top = stack[stack.length - 1]
  if (top && top.level === level) {
    // Close the previous item and open the next one in the same list.
    html += '</li><li>'
  } else {
    html += ordered ? '<ul data-type="ordered-list"><li>' : '<ul><li>'
    stack.push({ level, ordered })
  }

  // The item stays open on purpose: it is closed either by the next sibling or by
  // closeListStack, so every <li> gets exactly one closing tag.
  return html + renderParagraph(paragraph, context, true)
}

function isHeading(paragraph: XmlElement, context: RenderContext): number | null {
  const properties = firstChild(paragraph, 'pPr')
  if (!properties) return null
  const styleElement = firstChild(properties, 'pStyle')
  if (!styleElement) return null
  const styleId = attributeOf(styleElement, 'val')
  if (!styleId) return null
  const style = context.styleMap.get(styleId)
  return style?.headingLevel ?? null
}

function renderParagraph(paragraph: XmlElement, context: RenderContext, inline = false): string {
  const headingLevel = isHeading(paragraph, context)
  const content = renderInlineRuns(paragraph, context)

  if (!content.trim()) return inline ? '' : ''

  if (headingLevel !== null) return `<h${headingLevel}>${content}</h${headingLevel}>`
  return inline ? content : `<p>${content}</p>`
}

function renderInlineRuns(paragraph: XmlElement, context: RenderContext): string {
  let html = ''
  for (const child of paragraph.children) {
    if (typeof child === 'string') continue
    const name = localNameOf(child.name)
    if (name === 'r') html += renderRun(child, context)
    else if (name === 'hyperlink') html += renderHyperlink(child, context)
    else if (name === 'ins' || name === 'smartTag') html += renderInlineRuns(child, context)
    else if (name === 'del') continue
  }
  return html
}

function renderRun(run: XmlElement, context: RenderContext): string {
  let text = ''

  for (const child of run.children) {
    if (typeof child === 'string') continue
    const name = localNameOf(child.name)
    if (name === 't') text += textContent(child)
    else if (name === 'tab') text += '\t'
    else if (name === 'br') text += '<br>'
    else if (name === 'cr') text += '<br>'
    else if (name === 'drawing' || name === 'pict') {
      const image = renderDrawing(child, context)
      if (image) text += image
    }
  }

  if (!text) return ''

  const properties = firstChild(run, 'rPr')
  if (properties) {
    if (hasTruthyProperty(properties, 'b')) text = `<strong>${text}</strong>`
    if (hasTruthyProperty(properties, 'i')) text = `<em>${text}</em>`
    if (hasTruthyProperty(properties, 'u')) text = `<u>${text}</u>`
    if (hasTruthyProperty(properties, 'strike')) text = `<s>${text}</s>`
    const highlight = firstChild(properties, 'highlight')
    if (highlight && attributeOf(highlight, 'val') && attributeOf(highlight, 'val') !== 'none') {
      text = `<mark>${text}</mark>`
    }
  }

  return text
}

function renderHyperlink(element: XmlElement, context: RenderContext): string {
  const relationshipId = attributeOf(element, 'id')
  const anchor = attributeOf(element, 'anchor')
  const inner = renderInlineRuns(element, context)

  if (relationshipId) {
    const relationship = context.relationships.get(relationshipId)
    if (relationship?.target) {
      return `<a href="${escapeAttribute(relationship.target)}">${inner}</a>`
    }
  }
  if (anchor) return `<a href="#${escapeAttribute(anchor)}">${inner}</a>`
  return inner
}

function renderDrawing(drawing: XmlElement, context: RenderContext): string {
  const relationshipId = findRelationshipId(drawing)
  if (!relationshipId) return ''

  const relationship = context.relationships.get(relationshipId)
  if (!relationship) return ''

  const target = relationship.target.replace(/^\.\.\//, '').replace(/^\/?word\//, 'word/')
  const mediaKey = target.startsWith('word/') ? target : `word/${target}`
  const data = context.media.get(mediaKey) ?? context.media.get(target)
  if (!data) {
    context.warnings.push(`无法读取文档内嵌图片：${relationship.target}`)
    return ''
  }

  const docProps = findDescendant(drawing, 'docPr')
  const alt = docProps ? (attributeOf(docProps, 'descr') ?? attributeOf(docProps, 'name') ?? '') : ''

  context.imageCounter += 1
  const mime = mimeFromMediaPath(mediaKey)
  const dataUrl = `data:${mime};base64,${data.toString('base64')}`
  return `<img src="${dataUrl}" alt="${escapeAttribute(alt)}">`
}

function findRelationshipId(element: XmlElement): string | null {
  const blip = findDescendant(element, 'blip')
  if (blip) {
    const id = attributeOf(blip, 'embed') ?? attributeOf(blip, 'link')
    if (id) return id
  }
  const imagedata = findDescendant(element, 'imagedata')
  if (imagedata) {
    const id = attributeOf(imagedata, 'id')
    if (id) return id
  }
  return null
}

function findDescendant(element: XmlElement, localName: string): XmlElement | null {
  for (const child of element.children) {
    if (typeof child === 'string') continue
    if (localNameOf(child.name) === localName) return child
    const nested = findDescendant(child, localName)
    if (nested) return nested
  }
  return null
}

// ─── Tables ───────────────────────────────────────────────────────────────────

function renderTable(table: XmlElement, context: RenderContext): string {
  const rows = childElements(table, 'tr')
  if (!rows.length) return ''

  let html = '<table><tbody>'
  for (const row of rows) {
    html += '<tr>'
    for (const cell of childElements(row, 'tc')) {
      const properties = firstChild(cell, 'tcPr')
      const gridSpan = properties ? firstChild(properties, 'gridSpan') : null
      const colspan = gridSpan ? Number.parseInt(attributeOf(gridSpan, 'val') ?? '1', 10) : 1
      const cellParagraphs = childElements(cell, 'p').map((p) => renderParagraph(p, context, true)).join('')
      const tag = 'td'
      const span = Number.isFinite(colspan) && colspan > 1 ? ` colspan="${colspan}"` : ''
      // Nested tables inside cells are rare; render them as text-bearing blocks.
      const nested = childElements(cell, 'tbl').map((t) => renderTable(t, context)).join('')
      html += `<${tag}${span}>${cellParagraphs || '<p></p>'}${nested}</${tag}>`
    }
    html += '</tr>'
  }
  html += '</tbody></table>'
  return html
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

function readCoreTitle(archive: ReturnType<typeof openZip>): string {
  const xml = archive.readText('docProps/core.xml')
  if (!xml) return ''
  try {
    const root = parseXml(xml)
    const title = findFirstChild(root, ['title'])
    const text = title ? textContent(title).trim() : ''
    // Word writes "Title" as the document title; ignore the default placeholder.
    return text && !/^untitled$/i.test(text) ? text : ''
  } catch {
    return ''
  }
}

function firstNonEmptyLine(html: string): string {
  const headingMatch = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/)
  if (headingMatch) return stripTags(headingMatch[1]!).trim().slice(0, 80)
  const paragraphMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/)
  if (paragraphMatch) return stripTags(paragraphMatch[1]!).trim().slice(0, 80)
  return ''
}

function stripTags(html: string): string {
  return decodeHtmlText(html.replace(/<[^>]*>/g, ''))
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function mimeFromMediaPath(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    emf: 'image/emf',
    wmf: 'image/wmf',
  }
  return map[extension] ?? 'application/octet-stream'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
