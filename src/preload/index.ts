import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ShizhiApi } from '../shared/api.js'

const api: ShizhiApi = {
  platform: process.platform,
  documents: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.documentsList) as ReturnType<ShizhiApi['documents']['list']>,
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.documentsGet, id) as ReturnType<ShizhiApi['documents']['get']>,
    save: (payload) => ipcRenderer.invoke(IPC_CHANNELS.documentsSave, payload) as ReturnType<ShizhiApi['documents']['save']>,
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.documentsRemove, id) as ReturnType<ShizhiApi['documents']['remove']>,
  },
  categories: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.categoriesList) as ReturnType<ShizhiApi['categories']['list']>,
    save: (payload) => ipcRenderer.invoke(IPC_CHANNELS.categoriesSave, payload) as ReturnType<ShizhiApi['categories']['save']>,
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.categoriesRemove, id) as ReturnType<ShizhiApi['categories']['remove']>,
  },
  journals: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.journalsList) as ReturnType<ShizhiApi['journals']['list']>,
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.journalsGet, id) as ReturnType<ShizhiApi['journals']['get']>,
    save: (payload) => ipcRenderer.invoke(IPC_CHANNELS.journalsSave, payload) as ReturnType<ShizhiApi['journals']['save']>,
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.journalsRemove, id) as ReturnType<ShizhiApi['journals']['remove']>,
  },
  attachments: {
    pickImages: () => ipcRenderer.invoke(IPC_CHANNELS.attachmentsPickImages) as ReturnType<ShizhiApi['attachments']['pickImages']>,
    pickFiles: () => ipcRenderer.invoke(IPC_CHANNELS.attachmentsPickFiles) as ReturnType<ShizhiApi['attachments']['pickFiles']>,
  },
  window: {
    setCloseGuard: (hasUnsavedChanges) =>
      ipcRenderer.invoke(IPC_CHANNELS.windowSetCloseGuard, hasUnsavedChanges) as Promise<void>,
    onCloseRequested: (handler) => {
      ipcRenderer.on(IPC_CHANNELS.windowCloseRequested, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.windowCloseRequested, handler)
    },
  },
}

contextBridge.exposeInMainWorld('shizhi', api)
