import { BrowserWindow as ElectronBrowserWindow, dialog, type IpcMain, type OpenDialogOptions, type WebContents } from 'electron'
import { IPC_CHANNELS, type ShizhiApi } from '../shared/api.js'
import {
  validateCategorySavePayload,
  validateDocumentSavePayload,
  validateJournalSavePayload,
} from '../shared/validation.js'
import type { AttachmentStore } from './attachments.js'
import { AtomicDocumentRepository } from './documentRepository.js'

export interface IpcHandlerOptions {
  setHasUnsavedChanges(hasUnsavedChanges: boolean): void
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  repository: AtomicDocumentRepository,
  options?: IpcHandlerOptions & { attachments?: AttachmentStore },
): void {
  ipcMain.handle(IPC_CHANNELS.documentsList, () => repository.list())
  ipcMain.handle(IPC_CHANNELS.documentsGet, (_event, id) => repository.get(assertString(id)))
  ipcMain.handle(IPC_CHANNELS.documentsSave, (_event, payload) =>
    repository.save(validateDocumentSavePayload(payload)),
  )
  ipcMain.handle(IPC_CHANNELS.documentsRemove, (_event, id) => repository.remove(assertString(id)))

  ipcMain.handle(IPC_CHANNELS.categoriesList, () => repository.listCategories())
  ipcMain.handle(IPC_CHANNELS.categoriesSave, (_event, payload) =>
    repository.saveCategory(validateCategorySavePayload(payload)),
  )
  ipcMain.handle(IPC_CHANNELS.categoriesRemove, (_event, id) =>
    repository.removeCategory(assertString(id)),
  )

  ipcMain.handle(IPC_CHANNELS.journalsList, () => repository.listJournals())
  ipcMain.handle(IPC_CHANNELS.journalsGet, (_event, id) =>
    repository.getJournal(assertString(id)),
  )
  ipcMain.handle(IPC_CHANNELS.journalsSave, (_event, payload) =>
    repository.saveJournal(validateJournalSavePayload(payload)),
  )
  ipcMain.handle(IPC_CHANNELS.journalsRemove, (_event, id) =>
    repository.removeJournal(assertString(id)),
  )

  ipcMain.handle(IPC_CHANNELS.attachmentsPickImages, async (event) => {
    if (!options?.attachments) return []
    const filePaths = await showAttachmentDialog(event.sender, true)
    return options.attachments.addFiles(filePaths)
  })
  ipcMain.handle(IPC_CHANNELS.attachmentsPickFiles, async (event) => {
    if (!options?.attachments) return []
    const filePaths = await showAttachmentDialog(event.sender, false)
    return options.attachments.addFiles(filePaths)
  })
  ipcMain.handle(IPC_CHANNELS.windowSetCloseGuard, (_event, value) => {
    options?.setHasUnsavedChanges(assertBoolean(value))
  })
}

async function showAttachmentDialog(
  sender: WebContents,
  imagesOnly: boolean,
): Promise<string[]> {
  const owner = ElectronBrowserWindow.fromWebContents(sender)
  const result = owner
    ? await dialog.showOpenDialog(owner, attachmentDialogOptions(imagesOnly))
    : await dialog.showOpenDialog(attachmentDialogOptions(imagesOnly))
  return result.canceled ? [] : result.filePaths
}

function attachmentDialogOptions(imagesOnly: boolean): OpenDialogOptions {
  return {
    title: imagesOnly ? '选择图片' : '选择附件',
    properties: ['openFile', 'multiSelections'],
    filters: imagesOnly
      ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
      : [],
  }
}

function assertString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('Expected a non-empty string')
  return value
}

function assertBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TypeError('Expected a boolean')
  return value
}

export type RendererApi = ShizhiApi
