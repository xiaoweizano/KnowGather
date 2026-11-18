import {
  BrowserWindow as ElectronBrowserWindow,
  app,
  dialog,
  shell,
  type IpcMain,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type WebContents,
} from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { IPC_CHANNELS, type ImportPreviewResult, type ImportRequest, type ShizhiApi } from '../shared/api.js'
import {
  validateCategorySavePayload,
  validateDocumentSavePayload,
  validateJournalSavePayload,
} from '../shared/validation.js'
import { validateAppSettingsPatch, type AppInfo, type AppSettingsPatch } from '../shared/settings.js'
import type { AttachmentStore } from './attachments.js'
import type { ActivityStore } from './activityStore.js'
import type { SettingsStore } from './settingsStore.js'
import { checkForUpdates } from './updateService.js'
import { tm } from './locale.js'
import { AtomicDocumentRepository } from './documentRepository.js'
import { ARCHIVE_EXTENSIONS, SUPPORTED_EXTENSIONS, UNSUPPORTED_WORD_EXTENSIONS, importSources, type ImportSource } from './importers/importer.js'

export interface IpcHandlerOptions {
  setHasUnsavedChanges(hasUnsavedChanges: boolean): void
  attachments?: AttachmentStore
  settings?: SettingsStore
  activity?: ActivityStore
  setTaskbarVisible?(visible: boolean): void
  getAppInfo?(): AppInfo
  onSettingsChanged?(payload: AppSettingsPatch): void
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  repository: AtomicDocumentRepository,
  options?: IpcHandlerOptions,
): void {
  const attachments = options?.attachments
  const settings = options?.settings
  const activity = options?.activity

  ipcMain.handle(IPC_CHANNELS.documentsList, () => repository.list())
  ipcMain.handle(IPC_CHANNELS.documentsGet, (_event, id) => repository.get(assertString(id)))
  ipcMain.handle(IPC_CHANNELS.documentsSave, async (_event, payload) => {
    const validated = validateDocumentSavePayload(payload)
    const receipt = await repository.save(validated)
    void activity?.record({ kind: 'document', characters: countCharacters(validated.content) })
    return receipt
  })
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
  ipcMain.handle(IPC_CHANNELS.journalsSave, async (_event, payload) => {
    const validated = validateJournalSavePayload(payload)
    const receipt = await repository.saveJournal(validated)
    void activity?.record({ kind: 'journal', characters: countCharacters(validated.content) })
    return receipt
  })
  ipcMain.handle(IPC_CHANNELS.journalsRemove, (_event, id) =>
    repository.removeJournal(assertString(id)),
  )

  ipcMain.handle(IPC_CHANNELS.attachmentsPickImages, async (event) => {
    if (!attachments) return []
    const filePaths = await showAttachmentDialog(event.sender, true)
    return attachments.addFiles(filePaths)
  })
  ipcMain.handle(IPC_CHANNELS.attachmentsPickFiles, async (event) => {
    if (!attachments) return []
    const filePaths = await showAttachmentDialog(event.sender, false)
    return attachments.addFiles(filePaths)
  })
  ipcMain.handle(IPC_CHANNELS.attachmentsSaveImage, async (_event, payload) => {
    if (!attachments) throw new Error(tm('errorAttachmentUnavailable'))
    const request = parseImageSaveRequest(payload)
    return attachments.addBytes(request.bytes, request.name, request.mimeType, request.extension)
  })

  ipcMain.handle(IPC_CHANNELS.importsPick, async (event, request) => {
    const mode = parseImportRequest(request)
    const owner = ElectronBrowserWindow.fromWebContents(event.sender)
    const injectedPaths = readInjectedSelection(mode)
    const selection = injectedPaths
      ? { canceled: false, filePaths: injectedPaths }
      : mode === 'folder'
        ? await showDialog(owner, importFolderDialogOptions())
        : await showDialog(owner, importFileDialogOptions(mode))
    if (!selection || selection.canceled || selection.filePaths.length === 0) {
      return emptyImportResult(true)
    }

    const sources: ImportSource[] = selection.filePaths.map((path) => ({
      path,
      kind: mode === 'folder' ? 'folder' : mode === 'archive' ? 'archive' : 'file',
    }))
    const result = await importSources(sources)

    return {
      canceled: false,
      documents: result.documents.map((document) => ({
        title: document.title,
        html: document.html,
        format: document.format,
        sourceLabel: document.sourceLabel,
        encoding: document.encoding,
        warnings: document.warnings,
      })),
      failures: result.failures,
      skipped: result.skipped,
    } satisfies ImportPreviewResult
  })

  ipcMain.handle(IPC_CHANNELS.settingsGet, async () => {
    if (!settings) throw new Error('Settings storage is unavailable')
    return settings.get()
  })
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (_event, patch) => {
    if (!settings) throw new Error('Settings storage is unavailable')
    const validated = validateAppSettingsPatch(patch)
    const next = await settings.update(validated)
    options?.onSettingsChanged?.(validated)
    return next
  })

  ipcMain.handle(IPC_CHANNELS.appGetInfo, () => options?.getAppInfo?.() ?? defaultAppInfo())
  ipcMain.handle(IPC_CHANNELS.appSetAutoLaunch, async (_event, enabled) => {
    const value = assertBoolean(enabled)
    if (!settings) return { enabled: false, supported: false }
    const next = await settings.update({ autoLaunch: value })
    const supported = app.isPackaged
    if (supported) {
      app.setLoginItemSettings({ openAtLogin: value, args: value && next.silentStart ? ['--silent'] : [] })
    }
    return { enabled: supported ? value : false, supported }
  })
  ipcMain.handle(IPC_CHANNELS.appSetTaskbarVisible, async (_event, visible) => {
    options?.setTaskbarVisible?.(assertBoolean(visible))
  })
  ipcMain.handle(IPC_CHANNELS.appOpenDataFolder, async () => {
    await shell.openPath(app.getPath('userData'))
  })
  ipcMain.handle(IPC_CHANNELS.appOpenExternal, async (_event, url) => {
    const target = assertString(url)
    if (!/^https?:\/\//i.test(target)) throw new TypeError('Only http(s) URLs can be opened')
    await shell.openExternal(target)
  })
  ipcMain.handle(IPC_CHANNELS.appExportAll, async (event) => {
    const owner = ElectronBrowserWindow.fromWebContents(event.sender)
    const optionsSave: SaveDialogOptions = {
      title: tm('dialogSaveExport'),
      defaultPath: 'shizhi-export.json',
      filters: [{ name: tm('filterJson'), extensions: ['json'] }],
    }
    const selection = owner
      ? await dialog.showSaveDialog(owner, optionsSave)
      : await dialog.showSaveDialog(optionsSave)
    if (!selection.canceled && selection.filePath) {
      const payload = {
        exportedAt: new Date().toISOString(),
        documents: await repository.list(),
        categories: await repository.listCategories(),
        journals: await repository.listJournals(),
      }
      await mkdir(dirname(selection.filePath), { recursive: true })
      await writeFile(selection.filePath, JSON.stringify(payload, null, 2), 'utf8')
      return { saved: true, path: selection.filePath }
    }
    return { saved: false }
  })
  ipcMain.handle(IPC_CHANNELS.updateCheck, async (_event, feedUrl) => {
    const url = typeof feedUrl === 'string' ? feedUrl : null
    return checkForUpdates({ feedUrl: url, currentVersion: app.getVersion() })
  })
  ipcMain.handle(IPC_CHANNELS.activityList, async () => {
    if (!activity) return { days: {}, seeded: false }
    const [documents, journals] = await Promise.all([repository.list(), repository.listJournals()])
    return activity.list([...documents, ...journals])
  })

  ipcMain.handle(IPC_CHANNELS.windowSetCloseGuard, (_event, value) => {
    options?.setHasUnsavedChanges(assertBoolean(value))
  })
}

function defaultAppInfo(): AppInfo {
  return {
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    packaged: app.isPackaged,
  }
}

function parseImportRequest(value: unknown): ImportRequest['mode'] {
  const mode = (value as ImportRequest | undefined)?.mode
  if (mode === 'folder' || mode === 'archive' || mode === 'files') return mode
  throw new TypeError(tm('errorInvalidImportMode'))
}

/**
 * Test hook for automated acceptance runs.
 *
 * A native file dialog cannot be driven from an automated harness, so test runs
 * preset the paths via `SHIZHI_IMPORT_TEST_PATHS_FILE` (a JSON file keyed by
 * import mode). Inert in normal runs: without the variable the real dialog is
 * always shown.
 */
function readInjectedSelection(mode: ImportRequest['mode']): string[] | null {
  const file = process.env.SHIZHI_IMPORT_TEST_PATHS_FILE
  if (!file) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const value = parsed[mode]
    if (!Array.isArray(value)) return null
    const paths = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    return paths.length ? paths : null
  } catch {
    return null
  }
}

interface ImageSaveRequest {
  bytes: Uint8Array
  name: string
  mimeType: string
  extension: string
}

const MAX_IMPORTED_IMAGE_BYTES = 32 * 1024 * 1024

function parseImageSaveRequest(value: unknown): ImageSaveRequest {
  if (typeof value !== 'object' || value === null) throw new TypeError(tm('errorInvalidImagePayload'))
  const candidate = value as Record<string, unknown>

  const bytes = candidate.bytes
  if (!(bytes instanceof Uint8Array)) throw new TypeError(tm('errorInvalidImagePayload'))
  if (bytes.byteLength === 0) throw new TypeError(tm('errorEmptyImage'))
  if (bytes.byteLength > MAX_IMPORTED_IMAGE_BYTES) throw new TypeError(tm('errorImageTooLarge'))

  const name = typeof candidate.name === 'string' ? candidate.name.slice(0, 200) : ''
  const mimeType = typeof candidate.mimeType === 'string' ? candidate.mimeType : ''
  const extension = typeof candidate.extension === 'string' ? candidate.extension : ''
  if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType)) throw new TypeError(tm('errorInvalidImageType'))

  return { bytes, name: name || tm('defaultImportedImageName'), mimeType, extension }
}

function emptyImportResult(canceled: boolean): ImportPreviewResult {
  return { canceled, documents: [], failures: [], skipped: [] }
}

async function showDialog(owner: ElectronBrowserWindow | null, options: OpenDialogOptions) {
  return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options)
}

function importFileDialogOptions(mode: ImportRequest['mode']): OpenDialogOptions {
  const extensions = mode === 'archive'
    ? ARCHIVE_EXTENSIONS.map((extension) => extension.slice(1))
    : [...SUPPORTED_EXTENSIONS, ...UNSUPPORTED_WORD_EXTENSIONS].map((extension) => extension.slice(1))
  return {
    title: mode === 'archive' ? tm('dialogImportArchive') : tm('dialogImportFile'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: mode === 'archive' ? tm('filterArchives') : tm('filterSupported'), extensions },
      ...(mode === 'archive' ? [] : [{ name: tm('filterAllFiles'), extensions: ['*'] }]),
    ],
  }
}

function importFolderDialogOptions(): OpenDialogOptions {
  return {
    title: tm('dialogImportFolder'),
    properties: ['openDirectory'],
  }
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
    title: imagesOnly ? tm('dialogPickImages') : tm('dialogPickFiles'),
    properties: ['openFile', 'multiSelections'],
    filters: imagesOnly
      ? [{ name: tm('filterImages'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
      : [],
  }
}

function countCharacters(content: unknown): number {
  let count = 0
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const candidate = node as { text?: unknown; content?: unknown }
    if (typeof candidate.text === 'string') count += Array.from(candidate.text.replace(/\s/g, '')).length
    if (Array.isArray(candidate.content)) candidate.content.forEach(visit)
  }
  visit(content)
  return count
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
