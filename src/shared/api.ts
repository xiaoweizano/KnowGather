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
import type {
  ActivityPayload,
  AppInfo,
  AppSettings,
  AppSettingsPatch,
  AutoLaunchState,
  UpdateCheckResult,
} from './settings.js'

export interface ImportRequest {
  /** "files" picks individual files, "folder" a directory, "archive" a zip. */
  mode: 'files' | 'folder' | 'archive'
}

export interface ImportedDocumentPayload {
  title: string
  html: string
  format: 'text' | 'markdown' | 'docx'
  sourceLabel: string
  /** Local `YYYY-MM-DD` inferred from the file name and folder, or null. */
  date: string | null
  encoding?: string
  warnings: string[]
}

export interface ImportFailurePayload {
  sourceLabel: string
  reason: string
  /** Stable machine code so the renderer can translate the message. */
  code?: string
  /** Interpolated into the translated message as `{name}` style params. */
  params?: Record<string, string | number>
}

export interface ImportPreviewResult {
  documents: ImportedDocumentPayload[]
  failures: ImportFailurePayload[]
  skipped: ImportFailurePayload[]
  canceled: boolean
}

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
    /** Persists imported inline image bytes as a real attachment. */
    saveImage(payload: { bytes: Uint8Array; name: string; mimeType: string; extension: string }): Promise<AttachmentReference>
  }
  imports: {
    pick(request: ImportRequest): Promise<ImportPreviewResult>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: AppSettingsPatch): Promise<AppSettings>
  }
  app: {
    getInfo(): Promise<AppInfo>
    setAutoLaunch(enabled: boolean): Promise<AutoLaunchState>
    setTaskbarVisible(visible: boolean): Promise<void>
    openDataFolder(): Promise<void>
    openExternal(url: string): Promise<void>
    exportAll(): Promise<{ saved: boolean; path?: string }>
    onNavigate(handler: () => void): () => void
  }
  update: {
    check(feedUrl: string | null): Promise<UpdateCheckResult>
  }
  activity: {
    list(): Promise<ActivityPayload>
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
  attachmentsSaveImage: 'shizhi:attachments:save-image',
  importsPick: 'shizhi:imports:pick',
  settingsGet: 'shizhi:settings:get',
  settingsUpdate: 'shizhi:settings:update',
  appGetInfo: 'shizhi:app:get-info',
  appSetAutoLaunch: 'shizhi:app:set-auto-launch',
  appSetTaskbarVisible: 'shizhi:app:set-taskbar-visible',
  appOpenDataFolder: 'shizhi:app:open-data-folder',
  appOpenExternal: 'shizhi:app:open-external',
  appExportAll: 'shizhi:app:export-all',
  appNavigate: 'shizhi:app:navigate',
  updateCheck: 'shizhi:update:check',
  activityList: 'shizhi:activity:list',
  windowSetCloseGuard: 'shizhi:window:set-close-guard',
  windowCloseRequested: 'shizhi:window:close-requested',
} as const
