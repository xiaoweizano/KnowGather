import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createDocumentRecord, EMPTY_DOCUMENT } from '../src/shared/document'

interface Receipt {
  revision: number
  version: number
  savedAt: string
}

function installWindow(receipts: Receipt[]) {
  const original = createDocumentRecord({
    id: 'doc-save-receipt',
    title: '保存回执',
    content: EMPTY_DOCUMENT,
    now: '2026-11-13T08:00:00.000Z',
  })
  const saves: Array<Record<string, unknown>> = []
  const api = {
    platform: 'win32',
    documents: {
      list: async () => [original],
      get: async () => original,
      save: async (payload: Record<string, unknown>) => {
        saves.push(structuredClone(payload))
        const receipt = receipts.shift()
        if (!receipt) throw new Error('unexpected save')
        return receipt
      },
      remove: async () => undefined,
    },
    categories: { list: async () => [], save: async () => { throw new Error('not used') }, remove: async () => undefined },
    journals: {
      list: async () => [],
      get: async () => null,
      save: async () => { throw new Error('not used') },
      remove: async () => undefined,
    },
    attachments: { pickImages: async () => [], pickFiles: async () => [] },
    window: { setCloseGuard: async () => undefined, onCloseRequested: () => () => undefined },
  }
  const storage = new Map<string, string>()
  ;(globalThis as { window?: unknown }).window = {
    shizhi: api,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  }
  return { original, saves }
}

beforeEach(() => {
  vi.resetModules()
  setActivePinia(createPinia())
})


import type { CategoryRecord, DocumentRecord, JournalRecord } from '../src/shared/document'

interface CategoryDeleteFixture {
  category: CategoryRecord
  document: DocumentRecord
  journal: JournalRecord
  disk: { documents: DocumentRecord[]; categories: CategoryRecord[]; journals: JournalRecord[] }
  removeCategory: (id: string) => Promise<void>
  readCounts: { documents: number; categories: number; journals: number }
  saves: Array<Record<string, unknown>>
}

function installCategoryDeleteWindow(options: { failRemove?: boolean } = {}): CategoryDeleteFixture {
  const category: CategoryRecord = {
    id: 'category-delete', name: '待删除分类', createdAt: '2026-11-13T08:00:00.000Z',
    updatedAt: '2026-11-13T08:00:00.000Z', deletedAt: null,
  }
  const document: DocumentRecord = createDocumentRecord({
    id: 'doc-in-category', title: '分类内文档', categoryId: category.id,
    content: EMPTY_DOCUMENT, now: '2026-11-13T08:00:00.000Z',
  })
  const journal: JournalRecord = {
    id: 'journal-in-category', title: '分类内日志', categoryId: category.id,
    content: structuredClone(EMPTY_DOCUMENT), revision: 0, version: 1,
    createdAt: '2026-11-13T08:00:00.000Z', updatedAt: '2026-11-13T08:00:00.000Z', deletedAt: null,
  }
  const cascadeUpdatedAt = '2026-11-13T12:34:56.000Z'
  const disk = { documents: [document], categories: [category], journals: [journal] }
  const readCounts = { documents: 0, categories: 0, journals: 0 }
  const saves: Array<Record<string, unknown>> = []
  const removeCategory = async (id: string): Promise<void> => {
    if (options.failRemove) throw new Error('分类删除失败：模拟 IPC 错误')
    disk.categories = disk.categories.filter((item) => item.id !== id)
    disk.documents = disk.documents.map((item) => item.categoryId === id
      ? { ...item, categoryId: null, revision: item.revision, version: item.version + 1, updatedAt: cascadeUpdatedAt }
      : item)
    disk.journals = disk.journals.map((item) => item.categoryId === id
      ? { ...item, categoryId: null, revision: item.revision, version: item.version + 1, updatedAt: cascadeUpdatedAt }
      : item)
  }
  const api = {
    platform: 'win32',
    documents: {
      list: async () => { readCounts.documents += 1; return structuredClone(disk.documents) },
      get: async () => structuredClone(disk.documents[0]),
      save: async (payload: Record<string, unknown>) => {
        saves.push(structuredClone(payload))
        return { revision: Number(payload.revision), version: Number(payload.version) + 1, savedAt: '2026-11-13T13:00:00.000Z' }
      },
      remove: async () => undefined,
    },
    categories: {
      list: async () => { readCounts.categories += 1; return structuredClone(disk.categories) },
      save: async () => { throw new Error('not used') },
      remove: removeCategory,
    },
    journals: {
      list: async () => { readCounts.journals += 1; return structuredClone(disk.journals) },
      get: async () => structuredClone(disk.journals[0]),
      save: async () => { throw new Error('not used') },
      remove: async () => undefined,
    },
    attachments: { pickImages: async () => [], pickFiles: async () => [] },
    window: { setCloseGuard: async () => undefined, onCloseRequested: () => () => undefined },
  }
  ;(globalThis as { window?: unknown }).window = {
    shizhi: api,
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined },
  }
  return { category, document, journal, disk, removeCategory, readCounts, saves }
}

interface MoveFixture {
  current: DocumentRecord
  other: DocumentRecord
  saves: Array<Record<string, unknown>>
}

function installMoveWindow(receipts: Receipt[]): MoveFixture {
  const current = createDocumentRecord({
    id: 'doc-current',
    title: '当前文档',
    content: EMPTY_DOCUMENT,
    now: '2026-11-13T09:00:00.000Z',
  })
  const other = createDocumentRecord({
    id: 'doc-other',
    title: '其他文档',
    content: EMPTY_DOCUMENT,
    now: '2026-11-13T08:00:00.000Z',
  })
  const records = [current, other]
  const saves: Array<Record<string, unknown>> = []
  const api = {
    platform: 'win32',
    documents: {
      list: async () => structuredClone(records),
      get: async (id: string) => structuredClone(records.find((record) => record.id === id) ?? null),
      save: async (payload: Record<string, unknown>) => {
        saves.push(structuredClone(payload))
        const receipt = receipts.shift()
        if (!receipt) throw new Error('unexpected save')
        return receipt
      },
      remove: async () => undefined,
    },
    categories: { list: async () => [], save: async () => { throw new Error('not used') }, remove: async () => undefined },
    journals: {
      list: async () => [],
      get: async () => null,
      save: async () => { throw new Error('not used') },
      remove: async () => undefined,
    },
    attachments: { pickImages: async () => [], pickFiles: async () => [] },
    window: { setCloseGuard: async () => undefined, onCloseRequested: () => () => undefined },
  }
  ;(globalThis as { window?: unknown }).window = {
    shizhi: api,
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined },
  }
  return { current, other, saves }
}

describe('document store save receipts', () => {
  it('applies the move receipt to the current document save state', async () => {
    const movedSavedAt = '2026-11-13T14:00:00.000Z'
    const fixture = installMoveWindow([{ revision: 1, version: 2, savedAt: movedSavedAt }])
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()

    await expect(store.moveDocument(fixture.current.id, 'category-moved')).resolves.toBe(true)

    expect(fixture.saves).toEqual([
      expect.objectContaining({ id: fixture.current.id, categoryId: 'category-moved', revision: 1, version: 1 }),
    ])
    expect(store.current).toMatchObject({
      id: fixture.current.id,
      categoryId: 'category-moved',
      revision: 1,
      version: 2,
      updatedAt: movedSavedAt,
    })
    expect(store.saveState).toEqual({
      phase: 'saved',
      revision: 1,
      savedRevision: 1,
      savedVersion: 2,
      error: null,
      lastSavedAt: movedSavedAt,
    })
    await expect(store.saveNow()).resolves.toBe(true)
    expect(fixture.saves).toHaveLength(1)
  })

  it('does not overwrite the current document save state when moving another document', async () => {
    const otherSavedAt = '2026-11-13T14:10:00.000Z'
    const fixture = installMoveWindow([{ revision: 1, version: 2, savedAt: otherSavedAt }])
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()
    const currentBefore = JSON.parse(JSON.stringify(store.current))
    const saveStateBefore = JSON.parse(JSON.stringify(store.saveState))

    await expect(store.moveDocument(fixture.other.id, 'category-other')).resolves.toBe(true)

    expect(store.current).toEqual(currentBefore)
    expect(store.saveState).toEqual(saveStateBefore)
    expect(store.documents.find((document) => document.id === fixture.other.id)).toMatchObject({
      categoryId: 'category-other', revision: 1, version: 2, updatedAt: otherSavedAt,
    })
  })


  it('applies the authoritative version and savedAt after consecutive saves', async () => {
    const firstSavedAt = '2026-11-13T09:00:00.000Z'
    const secondSavedAt = '2026-11-13T09:01:00.000Z'
    const { original, saves } = installWindow([
      { revision: 1, version: 2, savedAt: firstSavedAt },
      { revision: 2, version: 3, savedAt: secondSavedAt },
    ])
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()

    store.updateTitle('第一次保存')
    await expect(store.saveNow()).resolves.toBe(true)
    expect(store.current).toMatchObject({ id: original.id, revision: 1, version: 2, updatedAt: firstSavedAt })
    expect(store.documents[0]).toMatchObject({ id: original.id, revision: 1, version: 2, updatedAt: firstSavedAt })
    expect(store.saveState).toMatchObject({ phase: 'saved', savedRevision: 1, savedVersion: 2, lastSavedAt: firstSavedAt })

    store.updateTitle('第二次保存')
    await expect(store.saveNow()).resolves.toBe(true)
    expect(saves.map((payload) => ({ revision: payload.revision, version: payload.version }))).toEqual([
      { revision: 1, version: 1 },
      { revision: 2, version: 2 },
    ])
    expect(store.current).toMatchObject({ id: original.id, revision: 2, version: 3, updatedAt: secondSavedAt })
    expect(store.documents[0]).toMatchObject({ id: original.id, revision: 2, version: 3, updatedAt: secondSavedAt })
    expect(store.saveState).toMatchObject({ phase: 'saved', savedRevision: 2, savedVersion: 3, lastSavedAt: secondSavedAt })
  })

  it('keeps current document and list metadata aligned with a conflict receipt', async () => {
    const conflictSavedAt = '2026-11-13T10:15:00.000Z'
    installWindow([{ revision: 9, version: 7, savedAt: conflictSavedAt }])
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()

    store.updateTitle('本地修改')
    await expect(store.saveNow()).resolves.toBe(true)

    expect(store.current).toMatchObject({ revision: 9, version: 7, updatedAt: conflictSavedAt })
    expect(store.documents[0]).toMatchObject({ revision: 9, version: 7, updatedAt: conflictSavedAt })
    expect(store.saveState).toMatchObject({ phase: 'saved', savedRevision: 9, savedVersion: 7, lastSavedAt: conflictSavedAt })
  })
  it('reloads authoritative documents, categories and journals after deleting a category', async () => {
    const fixture = installCategoryDeleteWindow()
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()
    fixture.readCounts.documents = 0
    fixture.readCounts.categories = 0
    fixture.readCounts.journals = 0

    await expect(store.deleteCategory(fixture.category.id)).resolves.toBe(true)

    expect(fixture.readCounts).toEqual({ documents: 1, categories: 1, journals: 1 })
    expect(store.categories).toEqual([])
    expect(store.documents).toEqual(fixture.disk.documents)
    expect(store.journals).toEqual(fixture.disk.journals)
    expect(store.current).toEqual(fixture.disk.documents[0])
    expect(store.current).toMatchObject({ id: fixture.document.id, categoryId: null, revision: 0, version: 2, updatedAt: '2026-11-13T12:34:56.000Z' })
    expect(store.journals[0]).toMatchObject({ id: fixture.journal.id, revision: 0, version: 2, updatedAt: '2026-11-13T12:34:56.000Z' })
    expect(store.saveState).toMatchObject({ phase: 'saved', savedRevision: 0, savedVersion: 2, lastSavedAt: '2026-11-13T12:34:56.000Z' })
  })

  it('saves the current document before deleting its category', async () => {
    const fixture = installCategoryDeleteWindow()
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()
    store.updateTitle('删除分类前的修改')

    await expect(store.deleteCategory(fixture.category.id)).resolves.toBe(true)

    expect(fixture.saves).toHaveLength(1)
    expect(fixture.saves[0]).toMatchObject({ id: fixture.document.id, title: '删除分类前的修改', categoryId: fixture.category.id })
  })

  it('preserves store state when category deletion IPC fails', async () => {
    const fixture = installCategoryDeleteWindow({ failRemove: true })
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()
    fixture.readCounts.documents = 0
    fixture.readCounts.categories = 0
    fixture.readCounts.journals = 0
    const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
    const before = {
      current: snapshot(store.current), documents: snapshot(store.documents),
      categories: snapshot(store.categories), journals: snapshot(store.journals), saveState: snapshot(store.saveState),
    }

    await expect(store.deleteCategory(fixture.category.id)).resolves.toBe(false)

    expect(store.error).toContain('分类删除失败')
    expect(store.current).toEqual(before.current)
    expect(store.documents).toEqual(before.documents)
    expect(store.categories).toEqual(before.categories)
    expect(store.journals).toEqual(before.journals)
    expect(store.saveState).toEqual(before.saveState)
    expect(fixture.readCounts).toEqual({ documents: 0, categories: 0, journals: 0 })
  })

})
