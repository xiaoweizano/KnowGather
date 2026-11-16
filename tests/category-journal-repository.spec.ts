import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AtomicDocumentRepository } from '../src/main/documentRepository'

const directories: string[] = []

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shizhi-v2-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('schema v2 knowledge repository', () => {
  it('persists documents, categories and journal entries across repository instances', async () => {
    const directory = await tempDirectory()
    const first = new AtomicDocumentRepository(directory)
    const category = await first.saveCategory({ name: '工作笔记' })
    const documentReceipt = await first.save({
      id: 'doc-v2-real',
      title: '分类中的文档',
      categoryId: category.id,
      tags: [],
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }] },
      revision: 0,
      version: 1,
    })
    const journalId = 'journal-v2-real'
    await first.saveJournal({
      id: journalId,
      title: '今日日志',
      categoryId: category.id,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '今天完成审计' }] }] },
      revision: 0,
      version: 1,
    })

    expect(documentReceipt.revision).toBe(0)
    const restarted = new AtomicDocumentRepository(directory)
    expect(await restarted.listCategories()).toEqual([expect.objectContaining({ id: category.id, name: '工作笔记' })])
    expect((await restarted.get('doc-v2-real'))?.categoryId).toBe(category.id)
    expect(await restarted.listJournals()).toEqual([expect.objectContaining({ id: journalId, title: '今日日志' })])
  })

  it('migrates a v1 database without losing content, revisions, timestamps or tombstones', async () => {
    const directory = await tempDirectory()
    const v1 = {
      schemaVersion: 1,
      documents: {
        'doc-v1': {
          id: 'doc-v1',
          title: '旧文档',
          tags: ['迁移'],
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '保留我' }] }] },
          revision: 7,
          version: 9,
          createdAt: '2026-01-02T03:04:05.000Z',
          updatedAt: '2026-02-03T04:05:06.000Z',
          deletedAt: null,
        },
        'doc-deleted': {
          id: 'doc-deleted', title: '已删除', tags: [],
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          revision: 2, version: 3,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
          deletedAt: '2026-01-03T00:00:00.000Z',
        },
      },
    }
    await writeFile(path.join(directory, 'shizhi-documents.json'), JSON.stringify(v1), 'utf8')

    const repository = new AtomicDocumentRepository(directory)
    const migrated = await repository.get('doc-v1')
    expect(migrated).toEqual(expect.objectContaining({
      id: 'doc-v1', categoryId: null, revision: 7, version: 9,
      createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-02-03T04:05:06.000Z', deletedAt: null,
    }))
    expect(await repository.get('doc-deleted')).toBeNull()

    const raw = JSON.parse(await readFile(path.join(directory, 'shizhi-documents.json'), 'utf8'))
    expect(raw.schemaVersion).toBe(2)
    expect(raw.documents['doc-v1'].content.content[0].content[0].text).toBe('保留我')
    expect(raw.documents['doc-deleted'].deletedAt).toBe('2026-01-03T00:00:00.000Z')
    expect(raw.categories).toEqual({})
    expect(raw.journalEntries).toEqual({})
  })

  it('fails loudly for unknown schemas and malformed persisted records', async () => {
    const directory = await tempDirectory()
    await writeFile(path.join(directory, 'shizhi-documents.json'), JSON.stringify({ schemaVersion: 99, documents: {} }), 'utf8')
    await expect(new AtomicDocumentRepository(directory).list()).rejects.toThrow(/schema/i)

    await writeFile(path.join(directory, 'shizhi-documents.json'), JSON.stringify({
      schemaVersion: 2, categories: {}, journalEntries: {},
      documents: { broken: { id: 'broken', title: 3 } },
    }), 'utf8')
    await expect(new AtomicDocumentRepository(directory).list()).rejects.toThrow(/document/i)
  })
})
