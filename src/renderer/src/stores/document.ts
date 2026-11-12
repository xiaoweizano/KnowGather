import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { DocumentRecord, DocumentSavePayload, TiptapDocument } from '../../../shared/document'
import { getShizhiApi } from '../services/api'
import { AutoSaveController, type AutoSaveState } from '../services/autosave'
import { DEFAULT_DOCUMENT, DEMO_DOCUMENTS } from '../data/demoDocuments'

export const useDocumentStore = defineStore('document', () => {
  const api = getShizhiApi()
  const current = ref<DocumentRecord | null>(null)
  const documents = ref<DocumentRecord[]>([])
  const loading = ref(true)
  const saveState = ref<AutoSaveState>({
    phase: 'idle',
    revision: 0,
    savedRevision: 0,
    error: null,
    lastSavedAt: null,
  })
  const editorInstanceId = ref<string | null>(null)
  const saveController = shallowRef<AutoSaveController | null>(null)

  const isDirty = computed(() => saveState.value.phase !== 'saved' && saveState.value.phase !== 'idle')
  const wordCount = computed(() => countDocumentCharacters(current.value?.content))

  function initAutoSave(): void {
    if (saveController.value) return
    saveController.value = new AutoSaveController({
      delay: 850,
      save: (payload) => api.documents.save(payload),
      onStateChange: (state) => {
        saveState.value = state
        void api.window.setCloseGuard(state.phase === 'dirty' || state.phase === 'saving' || state.phase === 'error')
      },
    })
  }

  async function initialize(): Promise<void> {
    initAutoSave()
    loading.value = true
    try {
      const stored = await api.documents.list()
      documents.value = stored.length > 0 ? stored : DEMO_DOCUMENTS
      current.value = stored[0] ?? DEFAULT_DOCUMENT
    } finally {
      loading.value = false
    }
  }

  async function selectDocument(id: string): Promise<void> {
    if (current.value?.id === id) return
    await saveNow()
    const stored = await api.documents.get(id)
    current.value = stored ?? DEMO_DOCUMENTS.find((document) => document.id === id) ?? DEFAULT_DOCUMENT
    saveState.value = {
      ...saveState.value,
      phase: 'saved',
      revision: current.value.revision,
      savedRevision: current.value.revision,
      error: null,
    }
  }

  function updateContent(content: TiptapDocument): void {
    if (!current.value) return
    current.value = {
      ...current.value,
      content,
      revision: current.value.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    scheduleSave()
  }

  function updateTitle(title: string): void {
    if (!current.value || current.value.title === title) return
    current.value = {
      ...current.value,
      title,
      revision: current.value.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    scheduleSave()
  }

  function updateTags(tags: string[]): void {
    if (!current.value) return
    current.value = { ...current.value, tags: [...tags], revision: current.value.revision + 1 }
    scheduleSave()
  }

  function registerEditor(id: string): void {
    editorInstanceId.value = id
  }

  function unregisterEditor(id: string): void {
    if (editorInstanceId.value === id) editorInstanceId.value = null
  }

  function scheduleSave(): void {
    if (!current.value) return
    initAutoSave()
    saveController.value?.schedule(toSavePayload(current.value))
  }

  async function saveNow(): Promise<boolean> {
    initAutoSave()
    return (await saveController.value?.flush()) ?? true
  }

  function retrySave(): Promise<boolean> {
    return saveNow()
  }

  function dispose(): void {
    saveController.value?.dispose()
    saveController.value = null
  }

  return {
    current,
    documents,
    loading,
    saveState,
    editorInstanceId,
    isDirty,
    wordCount,
    initialize,
    selectDocument,
    updateContent,
    updateTitle,
    updateTags,
    registerEditor,
    unregisterEditor,
    saveNow,
    retrySave,
    dispose,
  }
})

function toSavePayload(document: DocumentRecord): DocumentSavePayload {
  return {
    id: document.id,
    title: document.title,
    tags: [...document.tags],
    content: document.content,
    revision: document.revision,
    version: document.version,
  }
}

export function countDocumentCharacters(content: TiptapDocument | undefined): number {
  if (!content) return 0
  let count = 0
  const visit = (node: { text?: string; content?: Array<{ text?: string; content?: unknown[] }> }): void => {
    if (typeof node.text === 'string') count += Array.from(node.text.replace(/\s/g, '')).length
    node.content?.forEach((child) => visit(child as typeof node))
  }
  visit(content)
  return count
}
