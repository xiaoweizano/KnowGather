import type { TiptapDocument, TiptapMark, TiptapNode } from './document.js'

/**
 * Renders a document as Markdown for the assistant's tools.
 *
 * Deliberately separate from the editor's `documentToMarkdown`: that one lives
 * in the renderer and resolves UI strings through i18n, which the main process
 * must not import. This version is dependency-free and always emits fixed
 * labels — the model reads English placeholders fine, and the output is also
 * what gets written to files when the assistant exports something.
 */
export function documentToPlainMarkdown(document: TiptapDocument): string {
  return document.content
    .map((node) => renderBlock(node))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** First `limit` characters of readable text, for list previews. */
export function documentExcerpt(document: TiptapDocument, limit = 120): string {
  const parts: string[] = []
  const visit = (node: TiptapNode): void => {
    if (typeof node.text === 'string') parts.push(node.text)
    node.content?.forEach(visit)
  }
  document.content.forEach(visit)
  const text = parts.join(' ').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function renderBlock(node: TiptapNode, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return `${renderInline(node.content ?? [])}\n\n`
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return `${'#'.repeat(level)} ${renderInline(node.content ?? [])}\n\n`
    }
    case 'blockquote':
      return `${renderChildren(node.content ?? [], depth)
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}\n\n`
    case 'bulletList':
      return `${renderList(node, depth, false)}\n`
    case 'orderedList':
      return `${renderList(node, depth, true)}\n`
    case 'taskList':
      return `${renderTaskList(node, depth)}\n`
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      return `\`\`\`${language}\n${node.content?.map((child) => child.text ?? '').join('') ?? ''}\n\`\`\`\n\n`
    }
    case 'horizontalRule':
      return '---\n\n'
    case 'image': {
      const src = String(node.attrs?.src ?? '')
      const alt = String(node.attrs?.alt ?? 'image')
      return src ? `![${alt}](${src})\n\n` : ''
    }
    case 'attachment': {
      const name = String(node.attrs?.name ?? 'attachment')
      const url = String(node.attrs?.url ?? '')
      return url ? `[attachment: ${name}](${url})\n\n` : `${name}\n\n`
    }
    case 'table':
      return `${renderTable(node)}\n\n`
    case 'hardBreak':
      return '  \n'
    case 'text':
      return node.text ?? ''
    default:
      // Rich blocks (callouts, toggles, columns) have no Markdown spelling of
      // their own; their contents are what matters to the model.
      return node.content ? renderChildren(node.content, depth) : ''
  }
}

function renderChildren(nodes: readonly TiptapNode[], depth: number): string {
  return nodes.map((node) => renderBlock(node, depth)).join('')
}

function renderInline(nodes: readonly TiptapNode[]): string {
  return nodes.map((node) => applyMarks(node.text ?? '', node.marks ?? [])).join('')
}

function applyMarks(text: string, marks: readonly TiptapMark[]): string {
  let result = text
  for (const mark of marks) {
    if (mark.type === 'bold') result = `**${result}**`
    else if (mark.type === 'italic') result = `*${result}*`
    else if (mark.type === 'strike') result = `~~${result}~~`
    else if (mark.type === 'code') result = `\`${result}\``
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
      result = `[${result}](${mark.attrs.href})`
    }
  }
  return result
}

function renderList(node: TiptapNode, depth: number, ordered: boolean): string {
  const indent = '  '.repeat(depth)
  return (node.content ?? []).map((item, index) => {
    const marker = ordered ? `${index + 1}.` : '-'
    const body = renderChildren(item.content ?? [], depth + 1).trim()
    return `${indent}${marker} ${body.replace(/\n/g, `\n${indent}  `)}`
  }).join('\n')
}

function renderTaskList(node: TiptapNode, depth: number): string {
  const indent = '  '.repeat(depth)
  return (node.content ?? []).map((item) => {
    const checked = item.attrs?.checked === true ? 'x' : ' '
    const body = renderChildren(item.content ?? [], depth + 1).trim()
    return `${indent}- [${checked}] ${body.replace(/\n/g, `\n${indent}  `)}`
  }).join('\n')
}

function renderTable(node: TiptapNode): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => renderChildren(cell.content ?? [], 0).trim().replace(/\n+/g, '<br>').replace(/\|/g, '\\|')),
  )
  if (rows.length === 0) return ''
  const columnCount = Math.max(...rows.map((row) => row.length), 3)
  return rows.map((row, index) => {
    const padded = [...row, ...Array(Math.max(0, columnCount - row.length)).fill('')]
    const output = `| ${padded.join(' | ')} |`
    return index === 0 ? `${output}\n| ${Array(columnCount).fill('---').join(' | ')} |` : output
  }).join('\n')
}
