import type {
  AttachmentReference,
  CategoryRecord,
  CategorySavePayload,
  DocumentRecord,
  DocumentSavePayload,
  JournalRecord,
  JournalSavePayload,
  SaveReceipt,
} from './document.js'

export interface ShizhiApi {
  platform: string
  documents: {
    list(): Promise<DocumentRecord[]>
    get(id: string): Promise<DocumentRecord | null>
    save(payload: DocumentSavePayload): Promise<SaveReceipt>
    remove(id: string): Promise<void>
  }
  categories: {
    list(): Promise<CategoryRecord[]>
    save(payload: CategorySavePayload): Promise<CategoryRecord>
    remove(id: string): Promise<void>
  }
  journals: {
    list(): Promise<JournalRecord[]>
    get(id: string): Promise<JournalRecord | null>
    save(payload: JournalSavePayload): Promise<SaveReceipt>
    remove(id: string): Promise<void>
  }
  attachments: {
    pickImages(): Promise<AttachmentReference[]>
    pickFiles(): Promise<AttachmentReference[]>
  }
  window: {
    setCloseGuard(hasUnsavedChanges: boolean): Promise<void>
    onCloseRequested(handler: () => void): () => void
  }
}

export const IPC_CHANNELS = {
  documentsList: 'shizhi:documents:list',
  documentsGet: 'shizhi:documents:get',
  documentsSave: 'shizhi:documents:save',
  documentsRemove: 'shizhi:documents:remove',
  categoriesList: 'shizhi:categories:list',
  categoriesSave: 'shizhi:categories:save',
  categoriesRemove: 'shizhi:categories:remove',
  journalsList: 'shizhi:journals:list',
  journalsGet: 'shizhi:journals:get',
  journalsSave: 'shizhi:journals:save',
  journalsRemove: 'shizhi:journals:remove',
  attachmentsPickImages: 'shizhi:attachments:pick-images',
  attachmentsPickFiles: 'shizhi:attachments:pick-files',
  windowSetCloseGuard: 'shizhi:window:set-close-guard',
  windowCloseRequested: 'shizhi:window:close-requested',
} as const
