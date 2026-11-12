import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { IPC_CHANNELS } from '../shared/api.js'
import { AttachmentStore } from './attachments.js'
import { AtomicDocumentRepository } from './documentRepository.js'
import { registerIpcHandlers } from './ipc.js'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'shizhi-attachment',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

let mainWindow: BrowserWindow | null = null
let hasUnsavedChanges = false
let closeRequested = false

async function createWindow(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const repository = new AtomicDocumentRepository(userDataPath)
  const attachments = new AttachmentStore(join(userDataPath, 'attachments'))
  protocol.handle('shizhi-attachment', async (request) => {
    const resolved = attachments.resolveUrl(request.url)
    if (!resolved) return new Response('Not found', { status: 404 })
    try {
      const data = await readFile(resolved.path)
      return new Response(data, {
        headers: {
          'Content-Type': resolved.mimeType,
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  registerIpcHandlers(ipcMain, repository, {
    attachments,
    setHasUnsavedChanges(value) {
      hasUnsavedChanges = value
      if (!value && closeRequested) {
        closeRequested = false
        queueMicrotask(() => mainWindow?.close())
      }
    },
  })

  const appRoot = app.getAppPath()
  mainWindow = new BrowserWindow({
    width: 1402,
    height: 1122,
    minWidth: 960,
    minHeight: 720,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f5f4fb',
    webPreferences: {
      preload: join(appRoot, 'out/preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('close', (event) => {
    if (!hasUnsavedChanges) return
    event.preventDefault()
    if (closeRequested) return
    closeRequested = true
    mainWindow?.webContents.send(IPC_CHANNELS.windowCloseRequested)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(join(appRoot, 'out/renderer/index.html'))
  }
  mainWindow.show()
}

app.whenReady().then(async () => {
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
