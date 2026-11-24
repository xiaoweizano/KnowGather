import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AtomicDocumentRepository } from '../src/main/documentRepository'
import { BrowserDocumentRepository } from '../src/renderer/src/services/documentRepository'

const directories: string[] = []
const content = { type: 'doc' as const, content: [{ type: 'paragraph' }] }

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shizhi-journal-date-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function storage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const past = '2024-05-20T04:00:00.000Z'

describe('backdated journal entries', () => {
  it('keeps the first-save timestamp for imported history and counts it as created', async () => {
    const repository = new AtomicDocumentRepository(await tempDirectory())
    const receipt = await repository.saveJournal({
      id: 'journal-imported',
      title: '2024-05-20 日志',
      categoryId: null,
      content,
      revision: 0,
      version: 1,
      createdAt: past,
    })

    expect(receipt.created).toBe(true)
    expect(receipt.savedAt).toBe(past)
    const stored = await repository.getJournal('journal-imported')
    expect(stored?.createdAt).toBe(past)
    expect(stored?.updatedAt).toBe(past)

    const raw = JSON.parse(await readFile(
      path.join((repository as unknown as { userDataDir: string }).userDataDir, 'shizhi-documents.json'),
      'utf8',
    ))
    expect(raw.journalEntries['journal-imported'].createdAt).toBe(past)
  })

  it('ignores the backdate hint once the entry exists and for future timestamps', async () => {
    const repository = new AtomicDocumentRepository(await tempDirectory())
    await repository.saveJournal({ id: 'journal-1', title: '今天', categoryId: null, content, revision: 0, version: 1 })
    const edit = await repository.saveJournal({
      id: 'journal-1', title: '今天', categoryId: null, content, revision: 1, version: 2, createdAt: past,
    })
    expect(edit.created).toBe(false)
    expect(edit.savedAt).not.toBe(past)
    expect((await repository.getJournal('journal-1'))?.createdAt).not.toBe(past)

    const future = await repository.saveJournal({
      id: 'journal-future',
      title: '未来',
      categoryId: null,
      content,
      revision: 0,
      version: 1,
      createdAt: '2999-01-01T00:00:00.000Z',
    })
    expect(future.savedAt).not.toBe('2999-01-01T00:00:00.000Z')
  })

  it('keeps the same rules in the browser repository', async () => {
    const repository = new BrowserDocumentRepository(storage())
    const receipt = await repository.saveJournal({
      id: 'journal-browser',
      title: '2024-05-20 日志',
      categoryId: null,
      content,
      revision: 0,
      version: 1,
      createdAt: past,
    })
    expect(receipt.created).toBe(true)
    expect((await repository.getJournal('journal-browser'))?.createdAt).toBe(past)
  })

  it('persists the journal-to-document link across restarts', async () => {
    const directory = await tempDirectory()
    const first = new AtomicDocumentRepository(directory)
    await first.save({
      id: 'doc-1', title: '沉淀', categoryId: null, tags: [], favorite: false, content, revision: 0, version: 1,
      sourceJournalId: 'journal-1',
    })
    await first.saveJournal({
      id: 'journal-1', title: '日志', categoryId: null, content, revision: 0, version: 1, documentId: 'doc-1',
    })

    const restarted = new AtomicDocumentRepository(directory)
    expect((await restarted.get('doc-1'))?.sourceJournalId).toBe('journal-1')
    expect((await restarted.getJournal('journal-1'))?.documentId).toBe('doc-1')
  })

  it('reads records written before the link fields existed', async () => {
    const directory = await tempDirectory()
    await writeFile(path.join(directory, 'shizhi-documents.json'), JSON.stringify({
      schemaVersion: 2,
      categories: {},
      documents: {
        'doc-old': {
          id: 'doc-old', title: '旧文档', categoryId: null, tags: [], favorite: false,
          content, revision: 0, version: 1,
          createdAt: past, updatedAt: past, deletedAt: null,
        },
      },
      journalEntries: {
        'journal-old': {
          id: 'journal-old', title: '旧日志', categoryId: null, content, revision: 0, version: 1,
          createdAt: past, updatedAt: past, deletedAt: null,
        },
      },
    }), 'utf8')

    const repository = new AtomicDocumentRepository(directory)
    expect((await repository.get('doc-old'))?.sourceJournalId).toBeNull()
    expect((await repository.getJournal('journal-old'))?.documentId).toBeNull()
  })

  it('does not resurrect a deleted entry from a later autosave', async () => {
    const repository = new AtomicDocumentRepository(await tempDirectory())
    await repository.saveJournal({ id: 'journal-gone', title: '删除前', categoryId: null, content, revision: 0, version: 1 })
    await repository.removeJournal('journal-gone')

    const receipt = await repository.saveJournal({
      id: 'journal-gone', title: '删除前', categoryId: null, content, revision: 1, version: 2,
    })
    expect(receipt.created).toBe(false)
    expect(await repository.getJournal('journal-gone')).toBeNull()

    // Same rule for documents.
    await repository.save({ id: 'doc-gone', title: '文档', categoryId: null, tags: [], favorite: false, content, revision: 0, version: 1 })
    await repository.remove('doc-gone')
    await repository.save({ id: 'doc-gone', title: '文档', categoryId: null, tags: [], favorite: false, content, revision: 1, version: 2 })
    expect(await repository.get('doc-gone')).toBeNull()
  })
})
