import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { EMPTY_DOCUMENT } from '../src/shared/document'

function installBrowserWindow(): { saved: Array<Record<string, unknown>>; removed: string[] } {
  const saved: Array<Record<string, unknown>> = []
  const removed: string[] = []
  const api = {
    platform: 'win32',
    documents: {
      list: async () => [],
      get: async () => null,
      save: async (payload: Record<string, unknown>) => {
        saved.push(structuredClone(payload))
        return { revision: Number(payload.revision), version: Number(payload.version) + 1, savedAt: '2026-11-13T00:00:00.000Z' }
      },
      remove: async (id: string) => { removed.push(id) },
    },
    categories: {
      list: async () => [],
      save: async () => { throw new Error('not used') },
      remove: async () => undefined,
    },
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
  return { saved, removed }
}

beforeEach(() => {
  vi.resetModules()
  setActivePinia(createPinia())
})

describe('document store empty state', () => {
  it('keeps a genuinely empty knowledge base empty instead of injecting demo records', async () => {
    installBrowserWindow()
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()

    await store.initialize()

    expect(store.documents).toEqual([])
    expect(store.current).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('creates a real document and selects it after persistence succeeds', async () => {
    const { saved } = installBrowserWindow()
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()

    const created = await store.createDocument({ title: '新文档', categoryId: null, content: EMPTY_DOCUMENT })

    expect(created).not.toBeNull()
    expect(saved).toHaveLength(1)
    expect(saved[0]?.title).toBe('新文档')
    expect(store.current?.id).toBe(created?.id)
    expect(store.documents.map((document) => document.id)).toContain(created?.id)
  })

  it('does not bring demo data back after deleting the final document', async () => {
    const { removed } = installBrowserWindow()
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()
    const created = await store.createDocument({ title: '最后一篇', categoryId: null, content: EMPTY_DOCUMENT })
    expect(created).not.toBeNull()

    await store.deleteDocument(created!.id)

    expect(removed).toEqual([created!.id])
    expect(store.documents).toEqual([])
    expect(store.current).toBeNull()
  })
})
