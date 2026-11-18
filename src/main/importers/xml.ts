/**
 * A small XML reader for OOXML parts.
 *
 * OOXML is well-formed XML with a single namespace prefix per part, so a
 * targeted parser is enough and avoids pulling in a dependency. It builds a
 * plain element tree and deliberately ignores namespaces, DTDs and processing
 * instructions — anything structural it does not expect surfaces as a parse
 * error rather than being silently skipped.
 */

export interface XmlElement {
  name: string
  attributes: Record<string, string>
  children: XmlNode[]
}

export type XmlNode = XmlElement | string

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) ? safeCodePoint(code) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? safeCodePoint(code) : match
    }
    return ENTITY_MAP[entity] ?? match
  })
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
  // Surrogates are not valid standalone code points.
  if (code >= 0xd800 && code <= 0xdfff) return ''
  return String.fromCodePoint(code)
}

export function parseXml(source: string): XmlElement {
  let cursor = 0

  function skipDeclaration(): void {
    // Skip an optional XML declaration and any leading doctype.
    while (cursor < source.length) {
      if (source.startsWith('<?', cursor)) {
        const end = source.indexOf('?>', cursor)
        if (end === -1) throw new Error('XML 声明未闭合')
        cursor = end + 2
      } else if (source.startsWith('<!--', cursor)) {
        const end = source.indexOf('-->', cursor)
        if (end === -1) throw new Error('XML 注释未闭合')
        cursor = end + 3
      } else if (source.startsWith('<!DOCTYPE', cursor)) {
        const end = source.indexOf('>', cursor)
        if (end === -1) throw new Error('XML DOCTYPE 未闭合')
        cursor = end + 1
      } else if (/\s/.test(source[cursor]!)) {
        cursor += 1
      } else {
        return
      }
    }
  }

  function parseElement(): XmlElement {
    if (source[cursor] !== '<') throw new Error(`XML 结构无效，位置 ${cursor}`)
    cursor += 1

    let name = ''
    while (cursor < source.length && !/[\s/>]/.test(source[cursor]!)) {
      name += source[cursor]
      cursor += 1
    }
    if (!name) throw new Error('XML 元素缺少名称')

    const attributes: Record<string, string> = {}

    while (cursor < source.length) {
      const char = source[cursor]!
      if (/\s/.test(char)) {
        cursor += 1
        continue
      }
      if (char === '/') {
        if (source[cursor + 1] !== '>') throw new Error(`XML 自闭合标签无效：${name}`)
        cursor += 2
        return { name, attributes, children: [] }
      }
      if (char === '>') {
        cursor += 1
        return parseChildren(name, attributes)
      }

      let attributeName = ''
      while (cursor < source.length && !/[\s=/>]/.test(source[cursor]!)) {
        attributeName += source[cursor]
        cursor += 1
      }
      while (cursor < source.length && /\s/.test(source[cursor]!)) cursor += 1
      if (source[cursor] !== '=') {
        // Attribute without a value: record it as present with an empty string.
        if (attributeName) attributes[attributeName] = ''
        continue
      }
      cursor += 1
      while (cursor < source.length && /\s/.test(source[cursor]!)) cursor += 1
      const quote = source[cursor]
      if (quote !== '"' && quote !== "'") throw new Error(`XML 属性缺少引号：${attributeName}`)
      cursor += 1
      let rawValue = ''
      while (cursor < source.length && source[cursor] !== quote) {
        rawValue += source[cursor]
        cursor += 1
      }
      if (cursor >= source.length) throw new Error(`XML 属性未闭合：${attributeName}`)
      cursor += 1
      attributes[attributeName] = decodeXmlEntities(rawValue)
    }

    throw new Error(`XML 元素未闭合：${name}`)
  }

  function parseChildren(parentName: string, attributes: Record<string, string>): XmlElement {
    const children: XmlNode[] = []

    while (cursor < source.length) {
      if (source.startsWith('</', cursor)) {
        const end = source.indexOf('>', cursor)
        if (end === -1) throw new Error(`XML 结束标签未闭合：${parentName}`)
        const closingName = source.slice(cursor + 2, end).trim()
        if (closingName !== parentName) {
          throw new Error(`XML 标签不匹配：期望 </${parentName}>，实际 </${closingName}>`)
        }
        cursor = end + 1
        return { name: parentName, attributes, children }
      }
      if (source.startsWith('<!--', cursor)) {
        const end = source.indexOf('-->', cursor)
        if (end === -1) throw new Error('XML 注释未闭合')
        cursor = end + 3
        continue
      }
      if (source.startsWith('<![CDATA[', cursor)) {
        const end = source.indexOf(']]>', cursor)
        if (end === -1) throw new Error('XML CDATA 未闭合')
        children.push(source.slice(cursor + 9, end))
        cursor = end + 3
        continue
      }
      if (source.startsWith('<?', cursor)) {
        const end = source.indexOf('?>', cursor)
        if (end === -1) throw new Error('XML 处理指令未闭合')
        cursor = end + 2
        continue
      }
      if (source[cursor] === '<') {
        children.push(parseElement())
        continue
      }

      let text = ''
      while (cursor < source.length && source[cursor] !== '<') {
        text += source[cursor]
        cursor += 1
      }
      if (text) children.push(decodeXmlEntities(text))
    }

    throw new Error(`XML 元素未闭合：${parentName}`)
  }

  skipDeclaration()
  const root = parseElement()
  return root
}

/** Returns direct child elements with the given local name. */
export function childElements(element: XmlElement, localName: string): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement => typeof child !== 'string' && localNameOf(child.name) === localName,
  )
}

export function firstChild(element: XmlElement, localName: string): XmlElement | null {
  return childElements(element, localName)[0] ?? null
}

/** Returns the first child whose local name is in the list, preserving document order. */
export function findFirstChild(element: XmlElement, localNames: readonly string[]): XmlElement | null {
  for (const child of element.children) {
    if (typeof child === 'string') continue
    if (localNames.includes(localNameOf(child.name))) return child
  }
  return null
}

export function textContent(element: XmlElement): string {
  let text = ''
  for (const child of element.children) {
    if (typeof child === 'string') text += child
    else text += textContent(child)
  }
  return text
}

export function localNameOf(name: string): string {
  const index = name.indexOf(':')
  return index === -1 ? name : name.slice(index + 1)
}

export function attributeOf(element: XmlElement, localName: string): string | null {
  for (const [key, value] of Object.entries(element.attributes)) {
    if (localNameOf(key) === localName) return value
  }
  return null
}
