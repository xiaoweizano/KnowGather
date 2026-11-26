import { cloneDocumentJson, type TiptapDocument, type TiptapNode } from './document.js'

/**
 * Converts a model reply — usually Markdown — into editor blocks.
 *
 * Deliberately small: the assistant's job is prose, so headings, bullet and
 * numbered lists, quotes, fenced code and paragraphs are recognised; anything
 * else stays literal text rather than being dropped or mis-nested. Inline
 * emphasis is left as written: a reply that arrives with `**` is still legible,
 * while a half-implemented inline parser can silently unbalance a paragraph.
 *
 * Lives in `shared` because the main process also writes model output into
 * documents (the assistant's `create_document` / `update_document` tools).
 */
export function insertAiReplyIntoDocument(content: TiptapDocument, reply: string): TiptapDocument {
  const blocks = markdownToNodes(reply)
  if (!blocks.length) return cloneDocumentJson(content)
  const next = cloneDocumentJson(content)
  // A closing paragraph gives the user somewhere to keep typing after the paste.
  next.content.push(...blocks, { type: 'paragraph' })
  return next
}

export function markdownToDocument(markdown: string): TiptapDocument {
  const blocks = markdownToNodes(markdown)
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] }
}

export function markdownToNodes(markdown: string): TiptapNode[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const nodes: TiptapNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]!

    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/)
    if (fence) {
      const marker = fence[1]!
      const language = fence[2] ?? ''
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index]!.trim().startsWith(marker)) {
        code.push(lines[index]!)
        index += 1
      }
      index += 1
      nodes.push({
        type: 'codeBlock',
        attrs: language ? { language } : null,
        content: code.length ? [{ type: 'text', text: code.join('\n') }] : [],
      })
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      nodes.push({
        type: 'heading',
        attrs: { level: heading[1]!.length },
        content: textContent(heading[2]!),
      })
      index += 1
      continue
    }

    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      nodes.push({ type: 'horizontalRule' })
      index += 1
      continue
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index]!)) {
        quoted.push(lines[index]!.replace(/^\s*>\s?/, ''))
        index += 1
      }
      nodes.push({ type: 'blockquote', content: paragraphNodes(quoted.join('\n')) })
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (bullet || ordered) {
      const orderedList = Boolean(ordered)
      const items: TiptapNode[] = []
      while (index < lines.length) {
        const current = lines[index]!
        const match = orderedList ? current.match(/^\s*\d+[.)]\s+(.*)$/) : current.match(/^\s*[-*+]\s+(.*)$/)
        if (!match) break
        items.push({ type: 'listItem', content: paragraphNodes(match[1]!) })
        index += 1
      }
      nodes.push({ type: orderedList ? 'orderedList' : 'bulletList', content: items })
      continue
    }

    // Paragraph: consecutive plain lines, separated by `hardBreak` the way a
    // single newline renders in the source.
    const paragraph: string[] = []
    while (index < lines.length && lines[index]!.trim() && !startsBlock(lines[index]!)) {
      paragraph.push(lines[index]!)
      index += 1
    }
    if (paragraph.length) nodes.push(...paragraphNodes(paragraph.join('\n')))
  }

  return nodes
}

function startsBlock(line: string): boolean {
  return /^\s*(?:#{1,6}\s|>|[-*+]\s|\d+[.)]\s|(`{3,}|~{3,}))/.test(line)
}

function paragraphNodes(text: string): TiptapNode[] {
  const lines = text.split('\n')
  const content: TiptapNode[] = []
  lines.forEach((line, position) => {
    const node = textNode(line)
    if (node) content.push(node)
    if (position < lines.length - 1) content.push({ type: 'hardBreak' } as TiptapNode)
  })
  // A trailing hardBreak would leave an empty line the user cannot see.
  if (content.length && content[content.length - 1]!.type === 'hardBreak') content.pop()
  return [{ type: 'paragraph', content }]
}

function textContent(text: string): TiptapNode[] {
  const node = textNode(text)
  return node ? [node] : []
}

function textNode(text: string): TiptapNode | null {
  const trimmed = text.trimEnd()
  return trimmed ? { type: 'text', text: trimmed } : null
}
