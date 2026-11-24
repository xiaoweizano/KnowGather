import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { JournalRecord } from '../src/shared/document'

const HOUR = 60 * 60 * 1000

interface Harness {
  journalSaves: Array<Record<string, unknown>>
  documentSaves: Array<Record<string, unknown>>
  journals: Map<string, JournalRecord>
  documents: Map<string, Record<string, unknown>>
}

/**
 * Exercises promotion through the real store; the API stub mirrors the
 * repository receipts (revision/version/savedAt/created) closely enough for the
 * store's revision checks.
 */
function installBrowserWindow(): Harness {
  const harness: Harness = {
    journalSaves: [],
    documentSaves: [],
    journals: new Map(),
    documents: new Map(),
  }
  const receipt = (payload: Record<string, unknown>, created: boolean) => ({
    revision: Number(payload.revision),
    version: Number(payload.version) + 1,
    savedAt: new Date().toISOString(),
    created,
  })
  const api = {
    platform: 'win32',
    documents: {
      list: async () => [...harness.documents.values()],
      get: async (id: string) => harness.documents.get(id) ?? null,
      save: async (payload: Record<string, unknown>) => {
        harness.documentSaves.push(structuredClone(payload))
        const existing = harness.documents.get(String(payload.id))
        harness.documents.set(String(payload.id), {
          ...payload,
          createdAt: existing?.createdAt ?? payload.createdAt,
          updatedAt: payload.createdAt,
          deletedAt: null,
        })
        return receipt(payload, !existing)
      },
      remove: async () => undefined,
    },
    categories: {
      list: async () => [],
      save: async () => { throw new Error('not used') },
      remove: async () => undefined,
    },
    journals: {
      list: async () => [...harness.journals.values()],
      get: async (id: string) => harness.journals.get(id) ?? null,
      save: async (payload: Record<string, unknown>) => {
        harness.journalSaves.push(structuredClone(payload))
        const existing = harness.journals.get(String(payload.id))
        const now = new Date().toISOString()
        // Mirrors the repository: a backdate hint only applies to first saves.
        const backdated = !existing && typeof payload.createdAt === 'string' ? payload.createdAt : null
        const saved = {
          ...payload,
          createdAt: existing?.createdAt ?? backdated ?? now,
          updatedAt: backdated ?? now,
          deletedAt: null,
          documentId: payload.documentId ?? existing?.documentId ?? null,
        } as unknown as JournalRecord
        harness.journals.set(String(payload.id), saved)
        return {
          revision: Number(payload.revision),
          version: Number(payload.version) + 1,
          savedAt: saved.updatedAt,
          created: !existing,
        }
      },
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
  return harness
}

beforeEach(() => {
  vi.resetModules()
  setActivePinia(createPinia())
})

async function storeWithJournal() {
  installBrowserWindow()
  const { useDocumentStore } = await import('../src/renderer/src/stores/document')
  const store = useDocumentStore()
  await store.initialize()
  const journal = await store.createJournal({ title: '2024-05-20 日志', createdDate: '2024-05-20' })
  if (!journal) throw new Error('journal was not created')
  await store.selectJournal(journal.id)
  return { store, journal }
}

describe('journal promotion to the library', () => {
  it('backdates a new journal to the requested day', async () => {
    const harness = installBrowserWindow()
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()

    const journal = await store.createJournal({ title: '2024-05-20 日志', createdDate: '2024-05-20' })
    const noon = new Date(2024, 4, 20, 12).toISOString()

    expect(journal).not.toBeNull()
    expect(harness.journalSaves[0]?.createdAt).toBe(noon)
    expect(journal?.createdAt).toBe(noon)
  })

  it('opens or creates the entry for a heatmap day', async () => {
    installBrowserWindow()
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()

    expect(await store.openJournalForDay('2026-11-18', { create: false })).toBe(false)
    expect(store.currentJournal).toBeNull()

    expect(await store.openJournalForDay('2026-11-18')).toBe(true)
    expect(store.currentJournal?.title).toBe('2026-11-18 日志')

    // A second open reuses the same entry instead of creating a duplicate.
    expect(await store.openJournalForDay('2026-11-18')).toBe(true)
    expect(store.journals).toHaveLength(1)
  })

  it('copies the entry into a new document and links both sides', async () => {
    const { store, journal } = await storeWithJournal()
    store.updateJournalContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '沉淀的内容' }] }],
    })

    const document = await store.promoteJournalToDocument(journal.id, { title: '复盘', categoryId: 'work' })

    expect(document?.title).toBe('复盘')
    expect(document?.sourceJournalId).toBe(journal.id)
    expect(document?.categoryId).toBe('work')
    const linked = store.journals.find((entry) => entry.id === journal.id)
    expect(linked?.documentId).toBe(document?.id)
    expect(store.currentJournal?.documentId).toBe(document?.id)
  })

  it('re-syncs into the same document and keeps the tags already added there', async () => {
    const { store, journal } = await storeWithJournal()
    const first = await store.promoteJournalToDocument(journal.id, { title: '复盘', categoryId: null })
    if (!first) throw new Error('promotion failed')

    await store.selectDocument(first.id)
    store.addTag('重要')
    await store.saveNow()

    store.updateJournalContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '补充后的内容' }] }],
    })
    const second = await store.promoteJournalToDocument(journal.id, { title: '复盘（补）', categoryId: null })

    expect(second?.id).toBe(first.id)
    expect(second?.tags).toContain('重要')
    expect(second?.revision).toBeGreaterThan(first.revision)
    expect(store.documents.filter((entry) => entry.sourceJournalId === journal.id)).toHaveLength(1)
  })

  it('re-syncs when the linked document is open with pending edits', async () => {
    const { store, journal } = await storeWithJournal()
    const first = await store.promoteJournalToDocument(journal.id, { title: '复盘', categoryId: null })
    if (!first) throw new Error('promotion failed')

    // The document is the open one and has an unsaved edit in flight; the
    // promotion must re-read the revision the flush wrote instead of trusting
    // its stale snapshot.
    await store.selectDocument(first.id)
    store.updateTitle('复盘（手改）')
    store.updateJournalContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '再同步' }] }],
    })
    const second = await store.promoteJournalToDocument(journal.id, { title: '复盘（同步）', categoryId: null })

    expect(second?.id).toBe(first.id)
    expect(second?.title).toBe('复盘（同步）')
    expect(store.error).toBeNull()
  })

  it('flushes a pending journal title before closing', async () => {
    const { store, journal } = await storeWithJournal()
    store.updateJournalTitle('改名后立刻关闭')
    // Mirrors JournalPage.closeEditor / handleNavigation: flush, then dispose.
    await store.saveJournalNow()
    store.closeJournal()

    expect(store.currentJournal).toBeNull()
    const listed = store.journals.find((entry) => entry.id === journal.id)
    expect(listed?.title).toBe('改名后立刻关闭')
  })
})
