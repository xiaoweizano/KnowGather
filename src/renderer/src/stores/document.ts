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
  type TiptapNode,
} from '../../../shared/document'
import { dayKeyToLocalNoonIso, type ActivityPayload } from '../../../shared/settings'
import { getShizhiApi } from '../services/api'
import { AutoSaveController, type AutoSaveState } from '../services/autosave'
import { dataUrlToBytes, htmlToDocument, isDocumentEmpty } from '../services/importService'
import { journalForDay, journalTitleForDate } from '../app/journalView'
import { translate } from '../i18n'

export interface CreateDocumentInput {
  title?: string
  categoryId?: string | null
  content?: TiptapDocument
  /** Set when the document is a copy of a journal entry. */
  sourceJournalId?: string | null
}

export interface CreateJournalInput {
  title?: string
  categoryId?: string | null
  content?: TiptapDocument
  /** Local `YYYY-MM-DD`; imported entries keep the day they were written on. */
  createdDate?: string | null
}

export interface ImportIssue {
  sourceLabel: string
  /** Main-process fallback text, used when no translatable code is present. */
  reason: string
  /** Stable code the UI translates (`import.<code>`). */
  code?: string
  params?: Record<string, string | number>
}

export interface ImportOutcome {
  created: number
  failed: ImportIssue[]
  skipped: ImportIssue[]
  /** Documents that parsed but produced no content and were not imported. */
  empty: string[]
  /** How many of the created documents were filed under a past date. */
  dated: number
  canceled: boolean
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
  const currentJournal = ref<JournalRecord | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const saveState = ref<AutoSaveState>(idleSaveState())
  const journalSaveState = ref<AutoSaveState>(idleSaveState())
  // Editing activity is written by the main process on save, so the renderer
  // refetches it after writes instead of deriving it locally.
  const activity = ref<ActivityPayload>({ days: {}, seeded: false })
  const activityLoaded = ref(false)
  const editorInstanceId = ref<string | null>(null)
  const saveController = shallowRef<AutoSaveController<DocumentSavePayload> | null>(null)
  const journalSaveController = shallowRef<AutoSaveController<JournalRecord> | null>(null)

  const isDirty = computed(() => saveState.value.phase !== 'saved' && saveState.value.phase !== 'idle')
  const wordCount = computed(() => countDocumentCharacters(current.value?.content))

  function initAutoSave(): void {
    if (saveController.value) return
    saveController.value = new AutoSaveController({
      delay: 850,
      save: (payload) => api.documents.save(payload),
      onStateChange: (state) => {
        saveState.value = state
        syncCloseGuard()
        if (state.phase === 'saved' && state.lastSavedAt) {
          syncSavedRecord(state.savedRevision, state.savedVersion, state.lastSavedAt)
        }
      },
    })
  }

  function initJournalAutoSave(): void {
    if (journalSaveController.value) return
    journalSaveController.value = new AutoSaveController({
      delay: 850,
      save: (payload) => api.journals.save(toJournalSavePayloadForWrite(payload)),
      onStateChange: (state) => {
        journalSaveState.value = state
        syncCloseGuard()
        if (state.phase === 'saved' && state.lastSavedAt) {
          syncSavedJournal(state.savedRevision, state.savedVersion, state.lastSavedAt)
        }
      },
    })
  }

  function syncCloseGuard(): void {
    const phases = [saveState.value.phase, journalSaveState.value.phase]
    void api.window.setCloseGuard(phases.some((phase) => phase === 'dirty' || phase === 'saving' || phase === 'error'))
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

  /**
   * Reloads the lists without touching what the user has open.
   *
   * Used when another process wrote to the knowledge base — an assistant tool
   * run — where `initialize()` would be wrong: it reselects the first document
   * and would yank the editor out from under the user mid-edit.
   */
  async function refreshLists(): Promise<void> {
    try {
      const [storedDocuments, storedCategories, storedJournals] = await Promise.all([
        api.documents.list(),
        api.categories.list(),
        api.journals.list(),
      ])
      documents.value = sortByUpdatedAt(storedDocuments)
      categories.value = [...storedCategories]
      journals.value = sortByUpdatedAt(storedJournals)
      // Keep the open records if they still exist, with their newest revision.
      if (current.value) {
        const fresh = documents.value.find((document) => document.id === current.value?.id)
        if (fresh && fresh.revision <= current.value.revision) {
          // The editor holds newer unsaved state; leave it alone.
        } else if (fresh) {
          current.value = fresh
        }
      }
      if (currentJournal.value) {
        const fresh = journals.value.find((journal) => journal.id === currentJournal.value?.id)
        if (fresh && fresh.revision <= currentJournal.value.revision) {
          // Same rule: an in-flight edit wins over the reloaded copy.
        } else if (fresh) {
          currentJournal.value = fresh
        }
      }
    } catch {
      // A failed refresh leaves the previous lists in place.
    }
  }

  /**
   * Refetches the activity payload the heatmaps render. Saves are recorded by
   * the main process, so the renderer asks again after writes that change it.
   */
  async function refreshActivity(): Promise<void> {
    try {
      activity.value = await api.activity.list()
    } catch {
      // A decorative read: failing it must not break the page.
    } finally {
      activityLoaded.value = true
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
      sourceJournalId: input.sourceJournalId ?? null,
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
    return patchDocument(id, { categoryId }, '移动文档失败')
  }

  /** Renames any document, not just the open one. */
  async function renameDocument(id: string, title: string): Promise<boolean> {
    const next = title.trim()
    if (!next) return false
    return patchDocument(id, { title: next }, '重命名文档失败')
  }

  /** Favorites any document, not just the open one. */
  async function setDocumentFavorite(id: string, favorite: boolean): Promise<boolean> {
    return patchDocument(id, { favorite }, '收藏文档失败')
  }

  /**
   * Saves a partial change to one document.
   *
   * Non-current documents are re-read first: the repository ignores a save whose
   * revision is older than what is on disk and returns the stored receipt, so
   * patching a stale list entry would silently do nothing. The receipt revision
   * is then checked against the expected value so the UI never reports success
   * for a write that was skipped.
   */
  async function patchDocument(
    id: string,
    patch: Partial<Pick<DocumentRecord, 'title' | 'categoryId' | 'favorite'>>,
    errorLabel: string,
  ): Promise<boolean> {
    const isCurrent = id === current.value?.id
    if (isCurrent && !(await saveNow())) return false

    let target: DocumentRecord | undefined | null
    if (isCurrent) {
      target = current.value
    } else {
      // Prefer the list entry so a missing id is reported immediately, then
      // confirm the write actually landed by comparing the receipt revision.
      target = documents.value.find((document) => document.id === id)
      if (!target) {
        try {
          target = await api.documents.get(id)
        } catch (cause) {
          error.value = message(cause, errorLabel)
          return false
        }
      }
    }
    if (!target) {
      error.value = '文档不存在或已被删除'
      return false
    }

    const updated: DocumentRecord = {
      ...target,
      ...patch,
      revision: target.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    try {
      const receipt = await api.documents.save(toSavePayload(updated))
      if (receipt.revision !== updated.revision) {
        error.value = '文档已在别处更新，请重试'
        return false
      }
      const saved = { ...updated, revision: receipt.revision, version: receipt.version, updatedAt: receipt.savedAt }
      documents.value = sortByUpdatedAt(documents.value.map((document) => document.id === id ? saved : document))
      if (isCurrent) {
        current.value = saved
        saveState.value = savedStateFor(receipt.revision, receipt.version, receipt.savedAt)
      }
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, errorLabel)
      return false
    }
  }

  /** Moves a journal entry into another category. */
  async function moveJournal(id: string, categoryId: string | null): Promise<boolean> {
    return patchJournal(id, { categoryId }, '移动日志失败')
  }

  /** Renames a journal entry that is not necessarily open. */
  async function renameJournal(id: string, title: string): Promise<boolean> {
    const next = title.trim()
    if (!next) return false
    return patchJournal(id, { title: next }, '重命名日志失败')
  }

  async function patchJournal(
    id: string,
    patch: Partial<Pick<JournalRecord, 'title' | 'categoryId' | 'documentId'>>,
    errorLabel: string,
  ): Promise<boolean> {
    const isCurrent = id === currentJournal.value?.id
    if (isCurrent && !(await saveJournalNow())) return false

    let target: JournalRecord | undefined | null
    if (isCurrent) {
      target = currentJournal.value
    } else {
      target = journals.value.find((journal) => journal.id === id)
      if (!target) {
        try {
          target = await api.journals.get(id)
        } catch (cause) {
          error.value = message(cause, errorLabel)
          return false
        }
      }
    }
    if (!target) {
      error.value = '日志不存在或已被删除'
      return false
    }

    const updated: JournalRecord = {
      ...target,
      ...patch,
      revision: target.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    try {
      const receipt = await api.journals.save(toJournalSavePayload(updated))
      if (receipt.revision !== updated.revision) {
        error.value = '日志已在别处更新，请重试'
        return false
      }
      const saved = { ...updated, revision: receipt.revision, version: receipt.version, updatedAt: receipt.savedAt }
      journals.value = sortByUpdatedAt(journals.value.map((journal) => journal.id === id ? saved : journal))
      if (isCurrent) {
        currentJournal.value = saved
        journalSaveState.value = savedStateFor(receipt.revision, receipt.version, receipt.savedAt)
      }
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, errorLabel)
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
      documentId: null,
    }
    // The hint is only honoured on the first save; the repository stamps the
    // present once the record exists.
    const createdAt = input.createdDate ? dayKeyToLocalNoonIso(input.createdDate) : null
    try {
      const receipt = await api.journals.save({
        ...toJournalSavePayload(record),
        ...(createdAt ? { createdAt } : {}),
      })
      const saved = {
        ...record,
        revision: receipt.revision,
        version: receipt.version,
        createdAt: receipt.savedAt,
        updatedAt: receipt.savedAt,
      }
      journals.value = sortByUpdatedAt([...journals.value, saved])
      error.value = null
      return saved
    } catch (cause) {
      error.value = message(cause, '新建日志失败')
      return null
    }
  }

  /**
   * Opens the entry written on a local calendar day, creating a backdated one
   * when the day has no entry yet. Missing days are created on demand so a
   * heatmap cell can be filled in after the fact.
   */
  async function openJournalForDay(dayKey: string, options: { create?: boolean } = {}): Promise<boolean> {
    const existing = journalForDay(journals.value, dayKey)
    if (existing) return selectJournal(existing.id)
    if (options.create === false) return false
    const created = await createJournal({ createdDate: dayKey, title: journalTitleForDate(dayKey) })
    if (!created) return false
    return selectJournal(created.id)
  }

  async function selectJournal(id: string): Promise<boolean> {
    if (currentJournal.value?.id === id) return true
    if (!(await saveNow())) return false
    if (!(await saveJournalNow())) return false
    try {
      const stored = await api.journals.get(id)
      if (!stored) {
        error.value = '日志不存在或已被删除'
        return false
      }
      currentJournal.value = stored
      journalSaveState.value = savedStateFor(stored.revision, stored.version, stored.updatedAt)
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, '打开日志失败')
      return false
    }
  }

  function closeJournal(): void {
    currentJournal.value = null
    journalSaveState.value = idleSaveState()
    journalSaveController.value?.dispose()
    journalSaveController.value = null
  }

  function updateJournalTitle(title: string): void {
    if (!currentJournal.value || currentJournal.value.title === title) return
    currentJournal.value = {
      ...currentJournal.value,
      title,
      revision: currentJournal.value.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    scheduleJournalSave()
  }

  function updateJournalContent(content: TiptapDocument): void {
    if (!currentJournal.value) return
    currentJournal.value = {
      ...currentJournal.value,
      content,
      revision: currentJournal.value.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    scheduleJournalSave()
  }

  function scheduleJournalSave(): void {
    if (!currentJournal.value) return
    initJournalAutoSave()
    journalSaveController.value?.schedule(currentJournal.value)
  }

  async function saveJournalNow(): Promise<boolean> {
    initJournalAutoSave()
    return (await journalSaveController.value?.flush()) ?? true
  }

  function syncSavedJournal(savedRevision: number, savedVersion: number, savedAt: string): void {
    if (!currentJournal.value || journalSaveState.value.savedRevision !== savedRevision) return
    const saved = { ...currentJournal.value, revision: savedRevision, version: savedVersion, updatedAt: savedAt }
    currentJournal.value = saved
    journals.value = sortByUpdatedAt(journals.value.map((journal) => journal.id === saved.id ? saved : journal))
  }

  async function deleteJournal(id: string): Promise<boolean> {
    try {
      await api.journals.remove(id)
      journals.value = journals.value.filter((journal) => journal.id !== id)
      if (currentJournal.value?.id === id) closeJournal()
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, '删除日志失败')
      return false
    }
  }

  /**
   * Copies a journal into the library as a document and links the two.
   *
   * Syncing is a one-time copy: the document keeps its own tags and favorite and
   * is edited independently afterwards. Syncing the same journal again updates
   * the same document with the journal's latest content, so the link stays the
   * anchor rather than piling up duplicates.
   */
  async function promoteJournalToDocument(
    journalId: string,
    input: { title?: string; categoryId?: string | null } = {},
  ): Promise<DocumentRecord | null> {
    const isCurrent = currentJournal.value?.id === journalId
    if (isCurrent && !(await saveJournalNow())) return null

    const journal = isCurrent
      ? currentJournal.value
      : journals.value.find((entry) => entry.id === journalId) ?? await api.journals.get(journalId)
    if (!journal) {
      error.value = '日志不存在或已被删除'
      return null
    }

    const title = input.title?.trim() || journal.title
    const categoryId = input.categoryId === undefined ? journal.categoryId : input.categoryId

    const linked = journal.documentId
      ? documents.value.find((document) => document.id === journal.documentId) ?? await api.documents.get(journal.documentId)
      : null

    const document = linked
      ? await replaceDocumentContent(linked, title, categoryId, journal.content)
      : await createDocument({ title, categoryId, content: journal.content, sourceJournalId: journal.id })
    if (!document) return null

    if (journal.documentId !== document.id || journal.title !== title) {
      const ok = await patchJournal(journal.id, { documentId: document.id, title }, '同步到知识库失败')
      if (!ok) return null
    }
    await refreshActivity()
    return document
  }

  /** Rewrites an existing document's content after a re-sync, keeping its tags. */
  async function replaceDocumentContent(
    target: DocumentRecord,
    title: string,
    categoryId: string | null,
    content: TiptapDocument,
  ): Promise<DocumentRecord | null> {
    if (target.id === current.value?.id && !(await saveNow())) return null
    // Read back the revision the save just wrote: a stale snapshot would be
    // rejected by the repository's out-of-order guard. Non-current documents
    // are re-read for the same reason `patchDocument` does it.
    const fresh = target.id === current.value?.id
      ? current.value
      : await api.documents.get(target.id) ?? target
    if (!fresh) {
      error.value = '文档不存在或已被删除'
      return null
    }
    const updated: DocumentRecord = {
      ...fresh,
      title: title.trim() || fresh.title,
      categoryId,
      content: cloneDocumentJson(content),
      revision: fresh.revision + 1,
      updatedAt: new Date().toISOString(),
      sourceJournalId: fresh.sourceJournalId ?? null,
    }
    try {
      const receipt = await api.documents.save(toSavePayload(updated))
      if (receipt.revision !== updated.revision) {
        error.value = '文档已在别处更新，请重试'
        return null
      }
      const saved = { ...updated, revision: receipt.revision, version: receipt.version, updatedAt: receipt.savedAt }
      documents.value = sortByUpdatedAt(documents.value.map((document) => document.id === saved.id ? saved : document))
      if (current.value?.id === saved.id) {
        current.value = saved
        saveState.value = savedStateFor(receipt.revision, receipt.version, receipt.savedAt)
      }
      error.value = null
      return saved
    } catch (cause) {
      error.value = message(cause, '同步到知识库失败')
      return null
    }
  }

  /** Promotes a journal from the library side and opens the resulting document. */
  async function createDocumentFromJournal(input: { journalId: string; title: string; categoryId: string | null }): Promise<DocumentRecord | null> {
    const document = await promoteJournalToDocument(input.journalId, {
      title: input.title,
      categoryId: input.categoryId,
    })
    if (!document) return null
    await selectDocument(document.id)
    return document
  }

  /**
   * Imports files through the preload bridge and writes them as journal entries.
   *
   * Journals are the day-to-day surface, so imported history lands there, filed
   * under the date inferred from its file name or folder. `merge` appends
   * everything into the open document instead; it only makes sense from the
   * library, where a document is open. Failures are collected per file so one
   * bad file does not abort the batch.
   */
  async function importDocuments(options: {
    mode: 'files' | 'folder' | 'archive'
    categoryId: string | null
    merge: boolean
  }): Promise<ImportOutcome> {
    const outcome: ImportOutcome = { created: 0, failed: [], skipped: [], empty: [], dated: 0, canceled: false }

    let preview
    try {
      preview = await api.imports.pick({ mode: options.mode })
    } catch (cause) {
      outcome.failed.push({ sourceLabel: translate('import.source.import'), reason: message(cause, '无法读取所选内容'), code: 'readFailed' })
      error.value = message(cause, '导入失败')
      return outcome
    }

    if (preview.canceled) {
      outcome.canceled = true
      return outcome
    }

    outcome.failed.push(...preview.failures)
    outcome.skipped.push(...preview.skipped)

    const prepared: Array<{ title: string; content: TiptapDocument; sourceLabel: string; date: string | null }> = []
    for (const document of preview.documents) {
      try {
        const { document: content, embeddedImages } = htmlToDocument(document.html)
        const hydrated = await hydrateEmbeddedImages(content, embeddedImages)
        if (isDocumentEmpty(hydrated)) {
          outcome.empty.push(document.sourceLabel)
          continue
        }
        prepared.push({ title: document.title, content: hydrated, sourceLabel: document.sourceLabel, date: document.date })
      } catch (cause) {
        outcome.failed.push({ sourceLabel: document.sourceLabel, reason: message(cause, '内容解析失败'), code: 'parseFailed' })
      }
    }

    if (!prepared.length) {
      error.value = outcome.failed.length ? '所选文件都无法导入' : null
      return outcome
    }

    if (options.merge) {
      const merged = mergeIntoCurrent(prepared.map((item) => item.content))
      if (!merged) {
        outcome.failed.push({ sourceLabel: translate('import.source.merge'), reason: '当前没有打开的文档', code: 'mergeNoDocument' })
        return outcome
      }
      outcome.created = prepared.length
      return outcome
    }

    if (!(await saveJournalNow())) {
      outcome.failed.push({ sourceLabel: translate('import.source.import'), reason: '当前日志尚未保存，请稍后重试', code: 'documentUnsaved' })
      return outcome
    }

    const created: JournalRecord[] = []
    for (const item of prepared) {
      const occurrence = item.date ? dayKeyToLocalNoonIso(item.date) : null
      const record: JournalRecord = {
        id: crypto.randomUUID(),
        title: item.title.trim() || '无标题日志',
        content: cloneDocumentJson(item.content),
        categoryId: null,
        revision: 0,
        version: 1,
        createdAt: occurrence ?? new Date().toISOString(),
        updatedAt: occurrence ?? new Date().toISOString(),
        deletedAt: null,
        documentId: null,
      }
      try {
        const receipt = await api.journals.save({
          ...toJournalSavePayload(record),
          ...(occurrence ? { createdAt: occurrence } : {}),
        })
        created.push({
          ...record,
          revision: receipt.revision,
          version: receipt.version,
          createdAt: receipt.savedAt,
          updatedAt: receipt.savedAt,
        })
        outcome.created += 1
        if (item.date) outcome.dated += 1
      } catch (cause) {
        outcome.failed.push({ sourceLabel: item.sourceLabel, reason: message(cause, '保存失败'), code: 'saveFailed' })
      }
    }

    if (created.length) {
      journals.value = sortByUpdatedAt([...journals.value, ...created])
      error.value = null
      await refreshActivity()
    }

    return outcome
  }

  /** Appends imported documents to the open one, separated by a rule. */
  function mergeIntoCurrent(contents: TiptapDocument[]): boolean {
    const target = current.value
    if (!target) return false
    const separator: TiptapNode = { type: 'horizontalRule' }
    const existing: TiptapNode[] = target.content.content
    const merged: TiptapDocument = {
      type: 'doc',
      content: [
        ...existing,
        ...contents.flatMap((content) => [separator, ...content.content]),
      ],
    }
    updateContent(merged)
    return true
  }

  /**
   * Persists data-URL images as attachments and rewrites their `src`.
   *
   * Inline images cannot live in the document JSON, so each is written to the
   * attachment store and the placeholder is replaced with its stable URL. Images
   * that fail to persist are removed rather than left pointing at nothing.
   */
  async function hydrateEmbeddedImages(
    document: TiptapDocument,
    images: Array<{ placeholder: string; dataUrl: string }>,
  ): Promise<TiptapDocument> {
    if (!images.length) return document
    const replacements = new Map<string, string>()

    for (const [index, image] of images.entries()) {
      const decoded = dataUrlToBytes(image.dataUrl)
      if (!decoded) continue
      try {
        const reference = await api.attachments.saveImage({
          bytes: decoded.bytes,
          name: `导入图片-${index + 1}.${decoded.extension}`,
          mimeType: decoded.mimeType,
          extension: decoded.extension,
        })
        replacements.set(image.placeholder, reference.url)
      } catch {
        // A failed image must not fail the whole document.
      }
    }

    return rewriteImageSources(document, replacements, new Set(images.map((image) => image.placeholder)))
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

  function toggleFavorite(): boolean {
    if (!current.value) return false
    current.value = {
      ...current.value,
      favorite: !current.value.favorite,
      revision: current.value.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    scheduleSave()
    return current.value.favorite
  }

  function addTag(tag: string): boolean {
    if (!current.value) return false
    const next = tag.trim()
    if (!next) return false
    if (current.value.tags.includes(next)) return false
    updateTags([...current.value.tags, next])
    return true
  }

  function removeTag(tag: string): void {
    if (!current.value) return
    updateTags(current.value.tags.filter((item) => item !== tag))
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
    journalSaveController.value?.dispose()
    journalSaveController.value = null
  }

  return {
    current,
    documents,
    categories,
    journals,
    currentJournal,
    loading,
    error,
    activity,
    activityLoaded,
    refreshActivity,
    saveState,
    journalSaveState,
    editorInstanceId,
    isDirty,
    wordCount,
    initialize,
    refreshLists,
    selectDocument,
    createDocument,
    deleteDocument,
    moveDocument,
    renameDocument,
    setDocumentFavorite,
    moveJournal,
    renameJournal,
    createCategory,
    renameCategory,
    deleteCategory,
    createJournal,
    selectJournal,
    openJournalForDay,
    closeJournal,
    deleteJournal,
    promoteJournalToDocument,
    createDocumentFromJournal,
    updateContent,
    updateTitle,
    updateTags,
    toggleFavorite,
    addTag,
    removeTag,
    updateJournalTitle,
    updateJournalContent,
    importDocuments,
    registerEditor,
    unregisterEditor,
    saveNow,
    saveJournalNow,
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
    favorite: document.favorite,
    content: cloneDocumentJson(document.content),
    revision: document.revision,
    version: document.version,
    // Honoured only for the first save; the repository ignores it afterwards.
    createdAt: document.createdAt,
    sourceJournalId: document.sourceJournalId ?? null,
  }
}

// The journal autosave controller holds the live journal record, because that is
// what the editor mutates; the IPC boundary only needs the save payload shape.
function toJournalSavePayloadForWrite(journal: JournalRecord): JournalSavePayload {
  return toJournalSavePayload(journal)
}

function toJournalSavePayload(journal: JournalRecord): JournalSavePayload {
  return {
    id: journal.id,
    title: journal.title,
    content: cloneDocumentJson(journal.content),
    categoryId: journal.categoryId,
    revision: journal.revision,
    version: journal.version,
    // Honoured only for the first save; ignored once the record exists.
    createdAt: journal.createdAt,
    documentId: journal.documentId ?? null,
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

/**
 * Rewrites image `src` values in place (returning a copy). Placeholders without
 * a replacement are removed so the document never keeps an unresolvable source.
 */
function rewriteImageSources(
  document: TiptapDocument,
  replacements: Map<string, string>,
  placeholders: Set<string>,
): TiptapDocument {
  const rewriteNode = (node: TiptapNode): TiptapNode | null => {
    if (node.type === 'image') {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
      if (placeholders.has(src)) {
        const replacement = replacements.get(src)
        if (!replacement) return null
        return { ...node, attrs: { ...node.attrs, src: replacement } }
      }
      return node
    }
    if (!node.content) return node
    const content: TiptapNode[] = []
    for (const child of node.content) {
      const rewritten = rewriteNode(child)
      if (rewritten) content.push(rewritten)
    }
    return { ...node, content }
  }

  const content: TiptapNode[] = []
  for (const child of document.content) {
    const rewritten = rewriteNode(child)
    if (rewritten) content.push(rewritten)
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
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
