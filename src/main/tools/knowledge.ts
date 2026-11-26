import { randomUUID } from 'node:crypto'
import { localDayKey } from '../../shared/settings.js'
import { documentExcerpt, documentToPlainMarkdown } from '../../shared/documentText.js'
import { markdownToDocument } from '../../shared/markdownBlocks.js'
import {
  asRecord,
  optionalNumber,
  optionalString,
  requireString,
  ToolError,
  type AiTool,
  type KnowledgeCategory,
  type KnowledgeDocument,
  type KnowledgeJournal,
} from './registry.js'

/**
 * Tools over the user's own knowledge base.
 *
 * Every read goes through the repository's live list rather than a snapshot the
 * renderer had, so a run sees what is actually saved. Writes follow the same
 * revision discipline the editor uses; the model cannot clobber a newer edit.
 */

const MAX_LIST_RESULTS = 200
const MAX_SEARCH_RESULTS = 40

const listJournalsTool: AiTool = {
  danger: 'read',
  definition: {
    name: 'list_journals',
    description:
      '列出指定日期范围内的日志条目（按写入当天的本地日期筛选）。返回 id、日期、标题、字数与开头摘要。'
      + '用户说“本周/上周/最近几天”时，先按今天日期换算成起止日期再调用。只拿到摘要，需要正文时用 read_journal。',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: '起始日期，YYYY-MM-DD，含当天' },
        to: { type: 'string', description: '结束日期，YYYY-MM-DD，含当天' },
        limit: { type: 'number', description: '最多返回条数，默认全部，上限 200' },
      },
      required: ['from', 'to'],
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const from = parseDay(requireString(args, 'from'), 'from')
    const to = parseDay(requireString(args, 'to'), 'to')
    if (from > to) throw new ToolError('from 不能晚于 to')
    const limit = clampLimit(optionalNumber(args, 'limit'))
    const journals = await context.knowledge.listJournals()
    const matched = journals
      .map((journal) => ({ journal, day: localDayKey(new Date(journal.createdAt)) }))
      .filter(({ day }) => day >= from && day <= to)
      .sort((left, right) => left.day.localeCompare(right.day))
      .slice(0, limit)
      .map(({ journal, day }) => ({
        id: journal.id,
        day,
        title: journal.title,
        chars: documentToPlainMarkdown(journal.content).length,
        excerpt: documentExcerpt(journal.content, 120),
      }))
    if (!matched.length) return `在 ${from} 至 ${to} 之间没有找到日志。`
    return JSON.stringify(matched, null, 2)
  },
}

const readJournalTool: AiTool = {
  danger: 'read',
  definition: {
    name: 'read_journal',
    description: '读取一篇日志的完整正文（Markdown）。用 id 或日期二选一定位。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '日志 id（来自 list_journals）' },
        day: { type: 'string', description: 'YYYY-MM-DD，读取那一天的日志' },
      },
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const id = optionalString(args, 'id')
    const day = optionalString(args, 'day')
    if (!id && !day) throw new ToolError('需要 id 或 day 之一')
    let journal: KnowledgeJournal | null = null
    if (id) {
      journal = await context.knowledge.getJournal(id)
    } else {
      const target = parseDay(day!, 'day')
      const journals = await context.knowledge.listJournals()
      journal = journals.find((entry) => localDayKey(new Date(entry.createdAt)) === target) ?? null
    }
    if (!journal) throw new ToolError(id ? `找不到日志 ${id}` : `该日期没有日志：${day}`)
    const created = localDayKey(new Date(journal.createdAt))
    return `# ${journal.title}（${created}）\n\n${documentToPlainMarkdown(journal.content)}`
  },
}

const listDocumentsTool: AiTool = {
  danger: 'read',
  definition: {
    name: 'list_documents',
    description: '列出知识库文档，可按分类名或标签过滤。返回 id、标题、分类、标签、更新时间与字数。',
    inputSchema: {
      type: 'object',
      properties: {
        categoryName: { type: 'string', description: '分类名；省略则不限分类' },
        tag: { type: 'string', description: '按标签过滤' },
        limit: { type: 'number', description: '最多返回条数，默认 50，上限 200' },
      },
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const categoryName = optionalString(args, 'categoryName')
    const tag = optionalString(args, 'tag')
    const limit = clampLimit(optionalNumber(args, 'limit') ?? 50)
    const [documents, categories] = await Promise.all([
      context.knowledge.list(),
      context.knowledge.listCategories(),
    ])
    const categoryId = categoryName ? resolveCategoryId(categories, categoryName) : null
    if (categoryName && !categoryId) return `没有名为“${categoryName}”的分类。现有分类：${categories.map((item) => item.name).join('、') || '（无）'}`
    const matched = documents
      .filter((document) => (categoryId ? document.categoryId === categoryId : true))
      .filter((document) => {
        if (!tag) return true
        const needle = tag.toLocaleLowerCase('zh-CN')
        return document.tags.some((item) => item.toLocaleLowerCase('zh-CN') === needle)
      })
      .slice(0, limit)
      .map((document) => ({
        id: document.id,
        title: document.title,
        category: categoryNameOf(categories, document.categoryId),
        tags: document.tags,
        updatedAt: document.updatedAt,
        chars: documentToPlainMarkdown(document.content).length,
      }))
    if (!matched.length) return '没有符合条件的文档。'
    return JSON.stringify(matched, null, 2)
  },
}

const searchDocumentsTool: AiTool = {
  danger: 'read',
  definition: {
    name: 'search_documents',
    description: '在知识库文档的标题与正文中全文搜索关键词，返回命中片段。日志不在此工具范围内，用 list_journals/read_journal。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '最多返回条数，默认 20，上限 40' },
      },
      required: ['query'],
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const query = requireString(args, 'query').toLocaleLowerCase('zh-CN')
    const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, optionalNumber(args, 'limit') ?? 20))
    const [documents, categories] = await Promise.all([
      context.knowledge.list(),
      context.knowledge.listCategories(),
    ])
    const hits: Array<Record<string, unknown>> = []
    for (const document of documents) {
      const plain = documentToPlainMarkdown(document.content)
      const inTitle = document.title.toLocaleLowerCase('zh-CN').includes(query)
      const index = plain.toLocaleLowerCase('zh-CN').indexOf(query)
      if (!inTitle && index < 0) continue
      hits.push({
        id: document.id,
        title: document.title,
        category: categoryNameOf(categories, document.categoryId),
        snippet: index >= 0 ? snippetAround(plain, index, query.length) : documentExcerpt(document.content, 120),
        matchedTitle: inTitle,
      })
      if (hits.length >= limit) break
    }
    if (!hits.length) return `没有文档包含“${query}”。`
    return JSON.stringify(hits, null, 2)
  },
}

const readDocumentTool: AiTool = {
  danger: 'read',
  definition: {
    name: 'read_document',
    description: '读取一篇知识库文档的完整正文（Markdown）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '文档 id' } },
      required: ['id'],
    },
  },
  async execute(input, context) {
    const id = requireString(asRecord(input), 'id')
    const document = await context.knowledge.get(id)
    if (!document) throw new ToolError(`找不到文档 ${id}`)
    const categories = await context.knowledge.listCategories()
    const header = [
      `# ${document.title}`,
      `分类：${categoryNameOf(categories, document.categoryId)}｜标签：${document.tags.join('、') || '（无）'}｜更新于 ${document.updatedAt}`,
    ].join('\n')
    return `${header}\n\n${documentToPlainMarkdown(document.content)}`
  },
}

const listCategoriesTool: AiTool = {
  danger: 'read',
  definition: {
    name: 'list_categories',
    description: '列出知识库的分类，以及每个分类下的文档数与日志数。',
    inputSchema: { type: 'object', properties: {} },
  },
  async execute(_input, context) {
    const [categories, documents, journals] = await Promise.all([
      context.knowledge.listCategories(),
      context.knowledge.list(),
      context.knowledge.listJournals(),
    ])
    const rows = categories.map((category) => ({
      id: category.id,
      name: category.name,
      documents: documents.filter((document) => document.categoryId === category.id).length,
      journals: journals.filter((journal) => journal.categoryId === category.id).length,
    }))
    const uncategorized = {
      documents: documents.filter((document) => !document.categoryId).length,
      journals: journals.filter((journal) => !journal.categoryId).length,
    }
    return JSON.stringify({ categories: rows, uncategorized }, null, 2)
  },
}

const createDocumentTool: AiTool = {
  danger: 'write',
  definition: {
    name: 'create_document',
    description:
      '把内容保存成一篇新的知识库文档，正文用 Markdown。categoryName 指定的分类不存在时会自动创建。'
      + '用户要求“保存/存到知识库/生成周报”时使用；先在回复里给出正文，再调用本工具落盘。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '文档标题' },
        markdown: { type: 'string', description: '文档正文，Markdown 格式' },
        categoryName: { type: 'string', description: '分类名，例如“每周总结”；省略则不分类' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
      },
      required: ['title', 'markdown'],
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const title = requireString(args, 'title')
    const markdown = requireString(args, 'markdown')
    const categoryName = optionalString(args, 'categoryName')
    const tags = Array.isArray(args.tags)
      ? args.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).map((tag) => tag.trim())
      : []
    const categoryId = categoryName ? await ensureCategory(context, categoryName) : null
    const content = markdownToDocument(markdown)
    const id = randomUUID()
    await context.knowledge.save({
      id,
      title,
      categoryId,
      tags,
      favorite: false,
      content,
      revision: 0,
      version: 1,
      sourceJournalId: null,
    })
    context.notifyDocumentsChanged()
    return JSON.stringify({
      saved: true,
      id,
      title,
      category: categoryName ?? null,
      chars: markdown.length,
    }, null, 2)
  },
}

const updateDocumentTool: AiTool = {
  danger: 'write',
  definition: {
    name: 'update_document',
    description:
      '修改一篇已有文档。mode=replace 用新正文整体替换；mode=append 追加到末尾。正文用 Markdown。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '文档 id' },
        markdown: { type: 'string', description: '要写入的 Markdown 内容' },
        mode: { type: 'string', enum: ['replace', 'append'], description: '默认 replace' },
      },
      required: ['id', 'markdown'],
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const id = requireString(args, 'id')
    const markdown = requireString(args, 'markdown')
    const mode = optionalString(args, 'mode') === 'append' ? 'append' : 'replace'
    // Re-read: the model's list data may predate an edit made in the editor.
    const document = await context.knowledge.get(id)
    if (!document) throw new ToolError(`找不到文档 ${id}`)
    const incoming = markdownToDocument(markdown)
    const content = mode === 'append'
      ? {
          type: 'doc' as const,
          content: [
            ...document.content.content,
            { type: 'horizontalRule' as const },
            ...incoming.content,
          ],
        }
      : incoming
    await context.knowledge.save({
      id: document.id,
      title: document.title,
      categoryId: document.categoryId,
      tags: [...document.tags],
      favorite: document.favorite,
      content,
      revision: document.revision + 1,
      version: document.version,
      sourceJournalId: null,
    })
    context.notifyDocumentsChanged()
    return JSON.stringify({ updated: true, id, mode, title: document.title }, null, 2)
  },
}

async function ensureCategory(context: Parameters<AiTool['execute']>[1], name: string): Promise<string> {
  const trimmed = name.trim()
  const existing = (await context.knowledge.listCategories()).find((category) => category.name === trimmed)
  if (existing) return existing.id
  const created = await context.knowledge.saveCategory({ name: trimmed })
  return created.id
}

function resolveCategoryId(categories: readonly KnowledgeCategory[], name: string): string | null {
  const needle = name.trim().toLocaleLowerCase('zh-CN')
  return categories.find((category) => category.name.toLocaleLowerCase('zh-CN') === needle)?.id ?? null
}

function categoryNameOf(categories: readonly KnowledgeCategory[], id: string | null): string {
  if (!id) return '未分类'
  return categories.find((category) => category.id === id)?.name ?? '未分类'
}

/**
 * Validates a `YYYY-MM-DD` day key and returns it unchanged.
 *
 * String comparison is enough for range filtering because the keys are fixed
 * width and zero-padded; parsing is only needed to reject nonsense.
 */
function parseDay(value: string, field: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new ToolError(`${field} 必须是 YYYY-MM-DD`)
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (localDayKey(date) !== value) throw new ToolError(`${field} 不是有效日期：${value}`)
  return value
}

function clampLimit(value: number | undefined): number {
  if (value === undefined) return MAX_LIST_RESULTS
  return Math.min(MAX_LIST_RESULTS, Math.max(1, Math.trunc(value)))
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 60)
  const end = Math.min(text.length, index + length + 100)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`
}

/** Every knowledge-base tool, in the order the model sees them. */
export const knowledgeTools: AiTool[] = [
  listJournalsTool,
  readJournalTool,
  listDocumentsTool,
  searchDocumentsTool,
  readDocumentTool,
  listCategoriesTool,
  createDocumentTool,
  updateDocumentTool,
]

export type { KnowledgeDocument, KnowledgeJournal }
