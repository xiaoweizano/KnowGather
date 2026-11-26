import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AtomicDocumentRepository } from '../src/main/documentRepository'
import { knowledgeTools } from '../src/main/tools/knowledge'
import type { KnowledgeSavePayload, ToolContext } from '../src/main/tools/registry'
import { markdownToDocument } from '../src/shared/markdownBlocks'
import { documentToPlainMarkdown } from '../src/shared/documentText'
import type { TiptapDocument } from '../src/shared/document'

/**
 * Knowledge tools against the real repository, so the tests cover the revision
 * discipline and the JSON database format the app actually writes.
 */

let userData = ''
let repository: AtomicDocumentRepository
let changes = 0

function context(): ToolContext {
  return {
    workspaceRoot: '',
    fallbackCwd: userData,
    commandTimeoutMs: 5000,
    knowledge: repository,
    notifyDocumentsChanged: () => { changes += 1 },
    signal: new AbortController().signal,
  }
}

function tool(name: string) {
  const found = knowledgeTools.find((entry) => entry.definition.name === name)
  if (!found) throw new Error(`missing ${name}`)
  return found
}

/** Local noon ISO for a day key, the same convention imports use. */
function noon(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date!, 12, 0, 0).toISOString()
}

async function seedJournal(day: string, title: string, markdown: string): Promise<void> {
  await repository.saveJournal({
    id: `j-${day}`,
    title,
    content: markdownToDocument(markdown),
    categoryId: null,
    revision: 0,
    version: 1,
    createdAt: noon(day),
  })
}

async function seedDocument(input: {
  id: string
  title: string
  markdown: string
  categoryId?: string | null
  tags?: string[]
}): Promise<void> {
  const payload: KnowledgeSavePayload = {
    id: input.id,
    title: input.title,
    categoryId: input.categoryId ?? null,
    tags: input.tags ?? [],
    favorite: false,
    content: markdownToDocument(input.markdown),
    revision: 0,
    version: 1,
  }
  await repository.save(payload)
}

beforeAll(async () => {
  userData = await mkdtemp(path.join(tmpdir(), 'shizhi-kb-'))
  repository = new AtomicDocumentRepository(userData)
  await seedJournal('2026-11-23', '2026-11-23 日志', '完成登录页重构\n\n修了两个样式问题。')
  await seedJournal('2026-11-24', '2026-11-24 日志', '例会：确认下个迭代范围。')
  await seedJournal('2026-11-25', '2026-11-25 日志', '定位网关超时，根因是连接池配置。')
  await seedJournal('2026-11-19', '2026-11-19 日志', '上周的事，不该出现在本周范围里。')
  await seedDocument({ id: 'd-retro', title: 'Q4 复盘', markdown: '## 结论\n\n交付节奏稳定。', tags: ['复盘'] })
  await repository.saveCategory({ id: 'cat-weekly', name: '每周总结' })
  await seedDocument({ id: 'd-w47', title: '第 47 周周报', markdown: '本周主要推进登录重构。', categoryId: 'cat-weekly' })
})

afterAll(async () => {
  await rm(userData, { recursive: true, force: true }).catch(() => undefined)
})

describe('journal tools', () => {
  it('lists only the entries inside the inclusive date range', async () => {
    const output = await tool('list_journals').execute({ from: '2026-11-23', to: '2026-11-29' }, context())
    const parsed = JSON.parse(output) as Array<{ day: string; id: string }>
    expect(parsed.map((entry) => entry.day)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25'])
    expect(parsed.every((entry) => entry.id === `j-${entry.day}`)).toBe(true)
  })

  it('includes an excerpt so the model can decide what to read', async () => {
    const output = await tool('list_journals').execute({ from: '2026-11-23', to: '2026-11-23' }, context())
    expect(output).toContain('完成登录页重构')
  })

  it('says so when a range is empty', async () => {
    const output = await tool('list_journals').execute({ from: '2020-01-01', to: '2020-01-07' }, context())
    expect(output).toContain('没有找到日志')
  })

  it('rejects malformed and inverted ranges', async () => {
    await expect(tool('list_journals').execute({ from: '2026-13-01', to: '2026-12-01' }, context())).rejects.toThrow()
    await expect(tool('list_journals').execute({ from: '2026-11-29', to: '2026-11-23' }, context())).rejects.toThrow()
  })

  it('reads a journal by id or by day', async () => {
    const byId = await tool('read_journal').execute({ id: 'j-2026-11-25' }, context())
    expect(byId).toContain('连接池配置')
    expect(byId).toContain('2026-11-25')

    const byDay = await tool('read_journal').execute({ day: '2026-11-24' }, context())
    expect(byDay).toContain('例会')
  })

  it('errors for a day that has no entry', async () => {
    await expect(tool('read_journal').execute({ day: '2026-11-26' }, context())).rejects.toThrow(/没有日志/)
  })
})

describe('document tools', () => {
  it('filters by category name', async () => {
    const output = await tool('list_documents').execute({ categoryName: '每周总结' }, context())
    const parsed = JSON.parse(output) as Array<{ title: string }>
    expect(parsed.map((entry) => entry.title)).toEqual(['第 47 周周报'])
  })

  it('names the available categories when one does not exist', async () => {
    const output = await tool('list_documents').execute({ categoryName: '不存在' }, context())
    expect(output).toContain('每周总结')
  })

  it('filters by tag', async () => {
    const output = await tool('list_documents').execute({ tag: '复盘' }, context())
    expect(output).toContain('Q4 复盘')
    expect(output).not.toContain('第 47 周周报')
  })

  it('full-text searches titles and bodies', async () => {
    const byBody = await tool('search_documents').execute({ query: '交付节奏' }, context())
    expect(byBody).toContain('Q4 复盘')

    const byTitle = await tool('search_documents').execute({ query: '周报' }, context())
    expect(byTitle).toContain('第 47 周周报')
  })

  it('reads a document as Markdown with its metadata header', async () => {
    const output = await tool('read_document').execute({ id: 'd-retro' }, context())
    expect(output).toContain('Q4 复盘')
    expect(output).toContain('分类：')
    expect(output).toContain('标签：复盘')
    expect(output).toContain('## 结论')
  })

  it('lists categories with counts', async () => {
    const output = await tool('list_categories').execute({}, context())
    const parsed = JSON.parse(output) as { categories: Array<{ name: string; documents: number }> }
    const weekly = parsed.categories.find((entry) => entry.name === '每周总结')
    expect(weekly?.documents).toBe(1)
  })
})

describe('write tools', () => {
  it('creates a document and auto-creates a missing category', async () => {
    changes = 0
    const output = await tool('create_document').execute({
      title: '第 48 周周报',
      markdown: '## 本周完成\n\n- 登录重构\n- 网关修复',
      categoryName: '周报·新分类',
      tags: ['周报'],
    }, context())
    const parsed = JSON.parse(output) as { saved: boolean; id: string; category: string }
    expect(parsed.saved).toBe(true)
    expect(changes).toBe(1)

    const stored = await repository.get(parsed.id)
    expect(stored?.title).toBe('第 48 周周报')
    expect(stored?.tags).toEqual(['周报'])
    const categories = await repository.listCategories()
    const created = categories.find((entry) => entry.name === '周报·新分类')
    expect(created).toBeDefined()
    expect(stored?.categoryId).toBe(created!.id)
    // Markdown becomes real editor blocks, not one big paragraph.
    expect(stored?.content.content.map((node) => node.type)).toEqual(['heading', 'bulletList'])
  })

  it('reuses an existing category instead of duplicating it', async () => {
    await tool('create_document').execute({
      title: '第 49 周周报',
      markdown: '内容',
      categoryName: '每周总结',
    }, context())
    const categories = await repository.listCategories()
    expect(categories.filter((entry) => entry.name === '每周总结')).toHaveLength(1)
  })

  it('replaces or appends to an existing document', async () => {
    await tool('update_document').execute({ id: 'd-retro', markdown: '全部替换' }, context())
    expect(documentToPlainMarkdown((await repository.get('d-retro'))!.content)).toBe('全部替换')

    await tool('update_document').execute({ id: 'd-retro', markdown: '追加一段', mode: 'append' }, context())
    const appended = documentToPlainMarkdown((await repository.get('d-retro'))!.content)
    expect(appended).toContain('全部替换')
    expect(appended).toContain('追加一段')
  })

  it('fails cleanly for an unknown id', async () => {
    await expect(tool('update_document').execute({ id: 'nope', markdown: 'x' }, context())).rejects.toThrow(/找不到文档/)
  })
})

describe('markdown round trip', () => {
  it('renders editor nodes back to Markdown', () => {
    const document: TiptapDocument = markdownToDocument([
      '# 标题',
      '',
      '一段正文，含 **粗体** 和 *斜体*。',
      '',
      '- 第一条',
      '- 第二条',
      '',
      '1. 步骤一',
      '',
      '> 引用',
      '',
      '```ts',
      'const a = 1',
      '```',
    ].join('\n'))
    const markdown = documentToPlainMarkdown(document)
    expect(markdown).toContain('# 标题')
    expect(markdown).toContain('**粗体**')
    expect(markdown).toContain('- 第一条')
    expect(markdown).toContain('1. 步骤一')
    expect(markdown).toContain('> 引用')
    expect(markdown).toContain('```ts')
  })
})
