import type { ShizhiApi } from '../../../shared/api'
import type { AttachmentReference, DocumentRecord, DocumentSavePayload, SaveReceipt } from '../../../shared/document'
import { BrowserDocumentRepository } from './documentRepository'

const browserRepository = new BrowserDocumentRepository()

const browserApi: ShizhiApi = {
  documents: {
    list: () => browserRepository.list(),
    get: (id) => browserRepository.get(id),
    save: (payload) => browserRepository.save(payload),
    remove: (id) => browserRepository.remove(id),
  },
  attachments: {
    pickImages: () => pickBrowserFiles('image/*'),
    pickFiles: () => pickBrowserFiles(),
  },
  window: {
    setCloseGuard: async () => undefined,
    onCloseRequested: () => () => undefined,
  },
}

export function getShizhiApi(): ShizhiApi {
  return window.shizhi ?? browserApi
}

async function pickBrowserFiles(accept?: string): Promise<AttachmentReference[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (accept) input.accept = accept
    input.addEventListener(
      'change',
      () => {
        const files = Array.from(input.files ?? [])
        resolve(
          files.map((file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            url: `shizhi-attachment://${encodeURIComponent(file.name)}`,
          })),
        )
      },
      { once: true },
    )
    input.click()
  })
}

export type { DocumentRecord, DocumentSavePayload, SaveReceipt }

