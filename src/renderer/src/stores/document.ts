import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  cloneDocumentJson,
  createDocumentRecord,
  EMPTY_DOCUMENT,
  type CategoryRecord,
  type DocumentRecord,
  type DocumentSavePayload,
  type JournalRecord,
  type JournalSavePayload,
  type TiptapDocument,
} from '../../../shared/document'
import { getShizhiApi } from '../services/api'
import { AutoSaveController, type AutoSaveState } from '../services/autosave'

export interface CreateDocumentInput {
  title?: string
  categoryId?: string | null
  content?: TiptapDocument
}

export interface CreateJournalInput {
  title?: string
  categoryId?: string | null
  content?: TiptapDocument
}

const idleSaveState = (): AutoSaveState => ({
  phase: 'idle',
  revision: 0,
  savedRevision: 0,
  savedVersion: 0,
  error: null,
  lastSavedAt: null,
})

export const useDocumentStore = defineStore('document', () => {
  const api = getShizhiApi()
  const current = ref<DocumentRecord | null>(null)
  const documents = ref<DocumentRecord[]>([])
  const categories = ref<CategoryRecord[]>([])
  const journals = ref<JournalRecord[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const saveState = ref<AutoSaveState>(idleSaveState())
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
        if (state.phase === 'saved' && state.lastSavedAt) {
          syncSavedRecord(state.savedRevision, state.savedVersion, state.lastSavedAt)
        }
      },
    })
  }

  async function initialize(): Promise<void> {
    initAutoSave()
    loading.value = true
    error.value = null
    try {
      const [storedDocuments, storedCategories, storedJournals] = await Promise.all([
        api.documents.list(),
        api.categories.list(),
        api.journals.list(),
      ])
      documents.value = sortByUpdatedAt(storedDocuments)
      categories.value = [...storedCategories]
      journals.value = sortByUpdatedAt(storedJournals)
      current.value = documents.value[0] ?? null
      saveState.value = current.value
        ? savedStateFor(current.value.revision, current.value.version, current.value.updatedAt)
        : idleSaveState()
    } catch (cause) {
      current.value = null
      documents.value = []
      categories.value = []
      journals.value = []
      error.value = message(cause, '无法读取知识库')
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function selectDocument(id: string): Promise<void> {
    if (current.value?.id === id) return
    if (!(await saveNow())) return
    const stored = await api.documents.get(id)
    if (!stored) {
      error.value = '文档不存在或已被删除'
      return
    }
    current.value = stored
    error.value = null
    saveState.value = savedStateFor(stored.revision, stored.version, stored.updatedAt)
  }

  async function createDocument(input: CreateDocumentInput = {}): Promise<DocumentRecord | null> {
    if (!(await saveNow())) return null
    const record = createDocumentRecord({
      id: crypto.randomUUID(),
      title: input.title?.trim() || '无标题文档',
      categoryId: input.categoryId ?? null,
      content: input.content ?? EMPTY_DOCUMENT,
    })
    try {
      const receipt = await api.documents.save(toSavePayload(record))
      const saved = { ...record, revision: receipt.revision, version: receipt.version, updatedAt: receipt.savedAt }
      documents.value = sortByUpdatedAt([...documents.value, saved])
      current.value = saved
      error.value = null
      saveState.value = savedStateFor(receipt.revision, receipt.version, receipt.savedAt)
      return saved
    } catch (cause) {
      error.value = message(cause, '新建文档失败')
      return null
    }
  }

  async function deleteDocument(id: string): Promise<boolean> {
    if (current.value?.id === id && !(await saveNow())) return false
    try {
      await api.documents.remove(id)
      documents.value = documents.value.filter((document) => document.id !== id)
      if (current.value?.id === id) {
        current.value = documents.value[0] ?? null
        saveState.value = current.value
          ? savedStateFor(current.value.revision, current.value.version, current.value.updatedAt)
          : idleSaveState()
      }
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, '删除文档失败')
      return false
    }
  }

  async function moveDocument(id: string, categoryId: string | null): Promise<boolean> {
    const target = id === current.value?.id ? current.value : documents.value.find((document) => document.id === id)
    if (!target) {
      error.value = '文档不存在或已被删除'
      return false
    }
    if (id === current.value?.id && !(await saveNow())) return false
    const updated: DocumentRecord = {
      ...target,
      categoryId,
      revision: target.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    try {
      const receipt = await api.documents.save(toSavePayload(updated))
      const saved = { ...updated, revision: receipt.revision, version: receipt.version, updatedAt: receipt.savedAt }
      const wasCurrent = current.value?.id === id
      documents.value = sortByUpdatedAt(documents.value.map((document) => document.id === id ? saved : document))
      if (wasCurrent) {
        current.value = saved
        saveState.value = savedStateFor(receipt.revision, receipt.version, receipt.savedAt)
      }
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, '移动文档失败')
      return false
    }
  }

  async function createCategory(name: string): Promise<CategoryRecord | null> {
    try {
      const category = await api.categories.save({ name })
      categories.value = [...categories.value, category]
      error.value = null
      return category
    } catch (cause) {
      error.value = message(cause, '新建分类失败')
      return null
    }
  }

  async function renameCategory(id: string, name: string): Promise<CategoryRecord | null> {
    try {
      const category = await api.categories.save({ id, name })
      categories.value = categories.value.map((item) => item.id === id ? category : item)
      error.value = null
      return category
    } catch (cause) {
      error.value = message(cause, '重命名分类失败')
      return null
    }
  }

  async function deleteCategory(id: string): Promise<boolean> {
    if (current.value && !(await saveNow())) return false
    const currentDocumentId = current.value?.id ?? null
    try {
      await api.categories.remove(id)
      const [storedDocuments, storedCategories, storedJournals] = await Promise.all([
        api.documents.list(),
        api.categories.list(),
        api.journals.list(),
      ])
      documents.value = sortByUpdatedAt(storedDocuments)
      categories.value = [...storedCategories]
      journals.value = sortByUpdatedAt(storedJournals)
      current.value = currentDocumentId
        ? documents.value.find((document) => document.id === currentDocumentId) ?? null
        : null
      saveState.value = current.value
        ? savedStateFor(current.value.revision, current.value.version, current.value.updatedAt)
        : idleSaveState()
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, '删除分类失败')
      return false
    }
  }

  async function createJournal(input: CreateJournalInput = {}): Promise<JournalRecord | null> {
    const now = new Date().toISOString()
    const record: JournalRecord = {
      id: crypto.randomUUID(),
      title: input.title?.trim() || '无标题日志',
      content: cloneDocumentJson(input.content ?? EMPTY_DOCUMENT),
      categoryId: input.categoryId ?? null,
      revision: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    try {
      const receipt = await api.journals.save(toJournalSavePayload(record))
      const saved = { ...record, revision: receipt.revision, version: receipt.version, updatedAt: receipt.savedAt }
      journals.value = sortByUpdatedAt([...journals.value, saved])
      error.value = null
      return saved
    } catch (cause) {
      error.value = message(cause, '新建日志失败')
      return null
    }
  }

  async function deleteJournal(id: string): Promise<boolean> {
    try {
      await api.journals.remove(id)
      journals.value = journals.value.filter((journal) => journal.id !== id)
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, '删除日志失败')
      return false
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

  function syncSavedRecord(savedRevision: number, savedVersion: number, savedAt: string): void {
    if (!current.value || saveState.value.savedRevision !== savedRevision) return
    const saved = { ...current.value, revision: savedRevision, version: savedVersion, updatedAt: savedAt }
    current.value = saved
    documents.value = sortByUpdatedAt(documents.value.map((document) => document.id === saved.id ? saved : document))
  }

  function dispose(): void {
    saveController.value?.dispose()
    saveController.value = null
  }

  return {
    current,
    documents,
    categories,
    journals,
    loading,
    error,
    saveState,
    editorInstanceId,
    isDirty,
    wordCount,
    initialize,
    selectDocument,
    createDocument,
    deleteDocument,
    moveDocument,
    createCategory,
    renameCategory,
    deleteCategory,
    createJournal,
    deleteJournal,
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
    categoryId: document.categoryId,
    tags: [...document.tags],
    content: cloneDocumentJson(document.content),
    revision: document.revision,
    version: document.version,
  }
}

function toJournalSavePayload(journal: JournalRecord): JournalSavePayload {
  return {
    id: journal.id,
    title: journal.title,
    content: cloneDocumentJson(journal.content),
    categoryId: journal.categoryId,
    revision: journal.revision,
    version: journal.version,
  }
}

function savedStateFor(revision: number, version: number, savedAt: string): AutoSaveState {
  return {
    phase: 'saved',
    revision,
    savedRevision: revision,
    savedVersion: version,
    error: null,
    lastSavedAt: savedAt,
  }
}

function sortByUpdatedAt<T extends { updatedAt: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
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
