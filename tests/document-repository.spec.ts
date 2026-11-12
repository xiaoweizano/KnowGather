import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AtomicDocumentRepository } from '../src/main/documentRepository'
import type { DocumentSavePayload } from '../src/shared/document'

const tempDirectories: string[] = []

async function createRepository(): Promise<{ repository: AtomicDocumentRepository; directory: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shizhi-test-'))
  tempDirectories.push(directory)
  return { repository: new AtomicDocumentRepository(directory), directory }
}

function payload(revision: number, title = '正文'): DocumentSavePayload {
  return {
    id: 'doc-atomic',
    title,
    tags: ['测试'],
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] },
    revision,
    version: 1,
  }
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('AtomicDocumentRepository', () => {
  it('persists and reloads a document using an atomic rename', async () => {
    const { repository, directory } = await createRepository()
    const receipt = await repository.save(payload(3))

    expect(receipt.revision).toBe(3)
    const reloaded = await repository.get('doc-atomic')
    expect(reloaded?.title).toBe('正文')
    expect(reloaded?.content.content[0]?.content?.[0]?.text).toBe('正文')

    const raw = await readFile(path.join(directory, 'shizhi-documents.json'), 'utf8')
    expect(JSON.parse(raw).schemaVersion).toBe(1)
  })

  it('does not move the saved revision backwards when stale writes finish late', async () => {
    const { repository } = await createRepository()
    await repository.save(payload(8, '最新'))
    const staleReceipt = await repository.save(payload(4, '旧内容'))

    expect(staleReceipt.revision).toBe(8)
    expect((await repository.get('doc-atomic'))?.title).toBe('最新')
  })
})
