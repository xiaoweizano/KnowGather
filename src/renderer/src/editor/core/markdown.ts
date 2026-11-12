import type { AttachmentReference, TiptapDocument, TiptapMark, TiptapNode } from '@shared/document'

const ALIGNMENT_ROW = ['---', '---', '---']

export function documentToMarkdown(document: TiptapDocument): string {
  return document.content
    .map((node) => renderBlock(node))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n')
}

export function normalizeAttachmentReference(value: unknown): AttachmentReference | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<AttachmentReference>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.mimeType !== 'string' ||
    typeof candidate.size !== 'number' ||
    typeof candidate.url !== 'string' ||
    !candidate.url.startsWith('shizhi-attachment://')
  ) {
    return null
  }
  return {
    id: candidate.id,
    name: candidate.name,
    mimeType: candidate.mimeType || 'application/octet-stream',
    size: Math.max(0, candidate.size),
    url: candidate.url as AttachmentReference['url'],
  }
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
      return src ? `![${escapeMarkdown(alt)}](${src})\n\n` : ''
    }
    case 'attachment': {
      const name = String(node.attrs?.name ?? '附件')
      const url = String(node.attrs?.url ?? '')
      return url ? `[附件：${escapeMarkdown(name)}](${url})\n\n` : escapeMarkdown(name) + '\n\n'
    }
    case 'table':
      return `${renderTable(node)}\n\n`
    case 'hardBreak':
      return '  \n'
    case 'text':
      return escapeMarkdown(node.text ?? '')
    default:
      return node.content ? renderChildren(node.content, depth) : ''
  }
}

function renderChildren(nodes: readonly TiptapNode[], depth: number): string {
  return nodes.map((node) => renderBlock(node, depth)).join('')
}

function renderInline(nodes: readonly TiptapNode[]): string {
  return nodes.map((node) => applyMarks(escapeMarkdown(node.text ?? ''), node.marks ?? [])).join('')
}

function applyMarks(text: string, marks: readonly TiptapMark[]): string {
  let result = text
  for (const mark of marks) {
    if (mark.type === 'bold') result = `**${result}**`
    else if (mark.type === 'italic') result = `*${result}*`
    else if (mark.type === 'strike') result = `~~${result}~~`
    else if (mark.type === 'code') result = `\`${result}\``
    else if (mark.type === 'underline') result = `<u>${result}</u>`
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
  const columnCount = Math.max(...rows.map((row) => row.length), ALIGNMENT_ROW.length)
  return rows.map((row, index) => {
    const padded = [...row, ...Array(Math.max(0, columnCount - row.length)).fill('')]
    const output = `| ${padded.join(' | ')} |`
    return index === 0 ? `${output}\n| ${ALIGNMENT_ROW.concat(Array(Math.max(0, columnCount - ALIGNMENT_ROW.length)).fill('---')).join(' | ')} |` : output
  }).join('\n')
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>])/g, '\\$1')
}
