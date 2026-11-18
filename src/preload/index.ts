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
    saveImage: (payload) => ipcRenderer.invoke(IPC_CHANNELS.attachmentsSaveImage, payload) as ReturnType<ShizhiApi['attachments']['saveImage']>,
  },
  imports: {
    pick: (request) => ipcRenderer.invoke(IPC_CHANNELS.importsPick, request) as ReturnType<ShizhiApi['imports']['pick']>,
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet) as ReturnType<ShizhiApi['settings']['get']>,
    update: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch) as ReturnType<ShizhiApi['settings']['update']>,
  },
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo) as ReturnType<ShizhiApi['app']['getInfo']>,
    setAutoLaunch: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.appSetAutoLaunch, enabled) as ReturnType<ShizhiApi['app']['setAutoLaunch']>,
    setTaskbarVisible: (visible) => ipcRenderer.invoke(IPC_CHANNELS.appSetTaskbarVisible, visible) as Promise<void>,
    openDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.appOpenDataFolder) as Promise<void>,
    openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternal, url) as Promise<void>,
    exportAll: () => ipcRenderer.invoke(IPC_CHANNELS.appExportAll) as ReturnType<ShizhiApi['app']['exportAll']>,
    onNavigate: (handler) => {
      ipcRenderer.on(IPC_CHANNELS.appNavigate, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.appNavigate, handler)
    },
  },
  update: {
    check: (feedUrl) => ipcRenderer.invoke(IPC_CHANNELS.updateCheck, feedUrl) as ReturnType<ShizhiApi['update']['check']>,
  },
  activity: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.activityList) as ReturnType<ShizhiApi['activity']['list']>,
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
