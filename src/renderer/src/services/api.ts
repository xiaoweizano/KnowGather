import type { ShizhiApi } from '../../../shared/api'
import { detectDesktopPlatform } from '../../../shared/platform'
import type { AttachmentReference, DocumentRecord, DocumentSavePayload, SaveReceipt } from '../../../shared/document'
import {
  DEFAULT_APP_SETTINGS,
  localDayKey,
  normalizeAppSettings,
  normalizeFeedUrl,
  type ActivityPayload,
  type AppSettings,
  type AppSettingsPatch,
} from '../../../shared/settings'
import { BrowserDocumentRepository } from './documentRepository'

const browserRepository = new BrowserDocumentRepository()
const SETTINGS_KEY = 'shizhi.app-settings'
const ACTIVITY_KEY = 'shizhi.activity'

const browserApi: ShizhiApi = {
  platform: detectDesktopPlatform(navigator.platform, navigator.userAgent),
  documents: {
    list: () => browserRepository.list(),
    get: (id) => browserRepository.get(id),
    save: (payload) => browserRepository.save(payload),
    remove: (id) => browserRepository.remove(id),
  },
  categories: {
    list: () => browserRepository.listCategories(),
    save: (payload) => browserRepository.saveCategory(payload),
    remove: (id) => browserRepository.removeCategory(id),
  },
  journals: {
    list: () => browserRepository.listJournals(),
    get: (id) => browserRepository.getJournal(id),
    save: (payload) => browserRepository.saveJournal(payload),
    remove: (id) => browserRepository.removeJournal(id),
  },
  attachments: {
    pickImages: () => pickBrowserFiles('image/*'),
    pickFiles: () => pickBrowserFiles(),
    saveImage: async ({ bytes, name, mimeType }) => ({
      id: crypto.randomUUID(),
      name,
      mimeType,
      size: bytes.byteLength,
      url: `shizhi-attachment://${encodeURIComponent(name)}`,
    }),
  },
  imports: {
    pick: async () => ({ canceled: true, documents: [], failures: [], skipped: [] }),
  },
  settings: {
    get: async () => readBrowserSettings(),
    update: async (patch) => writeBrowserSettings(patch),
  },
  app: {
    getInfo: async () => ({
      version: 'development',
      platform: detectDesktopPlatform(navigator.platform, navigator.userAgent),
      electron: '',
      chrome: '',
      packaged: false,
    }),
    // Auto launch is a desktop capability; the browser fallback is explicit
    // about not supporting it rather than silently pretending.
    setAutoLaunch: async () => ({ enabled: false, supported: false }),
    setTaskbarVisible: async () => undefined,
    openDataFolder: async () => undefined,
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    exportAll: async () => {
      const [documents, categories, journals] = await Promise.all([
        browserRepository.list(),
        browserRepository.listCategories(),
        browserRepository.listJournals(),
      ])
      downloadJson({ exportedAt: new Date().toISOString(), documents, categories, journals })
      return { saved: true }
    },
    onNavigate: () => () => undefined,
  },
  update: {
    check: async (feedUrl) => ({
      status: normalizeFeedUrl(feedUrl) ? 'error' : 'not-configured',
      currentVersion: 'development',
      ...(normalizeFeedUrl(feedUrl) ? { message: 'Update checks require the desktop app' } : {}),
    }),
  },
  activity: {
    list: async () => readBrowserActivity(),
  },
  window: {
    setCloseGuard: async () => undefined,
    onCloseRequested: () => () => undefined,
  },
}

export function getShizhiApi(): ShizhiApi {
  return window.shizhi ?? browserApi
}

/** Used by the store after a successful save in browser mode. */
export function recordBrowserActivity(kind: 'document' | 'journal', characters: number): void {
  if (window.shizhi) return
  try {
    const activity = readBrowserActivity()
    const key = localDayKey(new Date())
    const day = activity.days[key] ?? { edits: 0, journals: 0, characters: 0 }
    activity.days[key] = {
      edits: day.edits + 1,
      journals: day.journals + (kind === 'journal' ? 1 : 0),
      characters: day.characters + Math.max(0, characters),
    }
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify({ ...activity, seeded: true }))
  } catch {
    // Activity is decorative; a failure must never break saving.
  }
}

function readBrowserSettings(): AppSettings {
  try {
    return normalizeAppSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_APP_SETTINGS }
  }
}

function writeBrowserSettings(patch: AppSettingsPatch): AppSettings {
  const next = normalizeAppSettings({ ...readBrowserSettings(), ...patch })
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  return next
}

function readBrowserActivity(): ActivityPayload {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? 'null') as ActivityPayload | null
    if (!parsed || typeof parsed.days !== 'object' || parsed.days === null) return { days: {}, seeded: false }
    return { days: parsed.days, seeded: parsed.seeded === true }
  } catch {
    return { days: {}, seeded: false }
  }
}

function downloadJson(payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'shizhi-export.json'
  anchor.click()
  URL.revokeObjectURL(url)
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
