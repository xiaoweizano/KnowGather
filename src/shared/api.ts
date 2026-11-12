import type { AttachmentReference, DocumentRecord, DocumentSavePayload, SaveReceipt } from './document.js'

export interface ShizhiApi {
  documents: {
    list(): Promise<DocumentRecord[]>
    get(id: string): Promise<DocumentRecord | null>
    save(payload: DocumentSavePayload): Promise<SaveReceipt>
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
  attachmentsPickImages: 'shizhi:attachments:pick-images',
  attachmentsPickFiles: 'shizhi:attachments:pick-files',
  windowSetCloseGuard: 'shizhi:window:set-close-guard',
  windowCloseRequested: 'shizhi:window:close-requested',
} as const
