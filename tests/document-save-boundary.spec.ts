import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createDocumentRecord } from '../src/shared/document'

describe('document save IPC boundary', () => {
  it('sends a structured-cloneable payload after reactive editor content changes', async () => {
    const original = createDocumentRecord({
      id: 'doc-save-boundary',
      title: '保存边界',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '内容' }] }] },
    })
    let captured: unknown = null
    const api = {
      platform: 'win32',
      documents: {
        list: async () => [original],
        get: async () => original,
        save: async (payload: unknown) => {
          captured = payload
          structuredClone(payload)
          return { revision: 1, version: 2, savedAt: '2026-11-12T00:00:00.000Z' }
        },
        remove: async () => undefined,
      },
      categories: { list: async () => [], save: async () => { throw new Error('not used') }, remove: async () => undefined },
      journals: { list: async () => [], get: async () => null, save: async () => { throw new Error('not used') }, remove: async () => undefined },
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
    Object.defineProperty(globalThis, 'navigator', {
      value: { platform: 'Win32', userAgent: 'Windows' },
      configurable: true,
    })

    setActivePinia(createPinia())
    const { useDocumentStore } = await import('../src/renderer/src/stores/document')
    const store = useDocumentStore()
    await store.initialize()
    store.updateContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '新内容' }] }],
    })

    const saved = await store.saveNow()
    expect(saved).toBe(true)
    expect(store.saveState.error).toBeNull()
    expect(captured).not.toBeNull()
    expect((captured as { content: unknown }).content).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '新内容' }] }],
    })
  })
})
