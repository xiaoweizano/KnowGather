import type { ShizhiApi } from '../../../shared/api'
import { detectDesktopPlatform } from '../../../shared/platform'
import type { AttachmentReference, DocumentRecord, DocumentSavePayload, SaveReceipt } from '../../../shared/document'
import {
  buildAiChatRequest,
  DEFAULT_AI_CONFIG,
  type AiChatErrorCode,
  type AiChatEvent,
  type AiChatRequest,
  type AiChatResult,
  type AiConfigPatch,
  type AiConfigView,
  type AiProviderConfig,
} from '../../../shared/ai'
import { AiStreamParser } from '../../../shared/aiStream'
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
const AI_CONFIG_KEY = 'shizhi.ai-config'
const AI_EVENT = 'shizhi:ai-event'

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
  ai: {
    getConfig: async () => toBrowserAiView(readBrowserAiConfig()),
    saveConfig: async (patch) => toBrowserAiView(writeBrowserAiConfig(patch)),
    test: async () => ({ ok: false, code: 'desktopOnly' as const, message: 'AI requests require the desktop app' }),
    chat: (request) => browserAiChat(request),
    cancel: async (requestId) => {
      browserAiControllers.get(requestId)?.abort()
    },
    // Browser mode has no agent loop: a tool call can never be parked here.
    approve: async () => undefined,
    onEvent: (handler) => {
      const listener = (event: Event): void => {
        const detail = (event as CustomEvent<unknown>).detail
        if (detail && typeof detail === 'object') handler(detail as Parameters<typeof handler>[0])
      }
      window.addEventListener(AI_EVENT, listener)
      return () => window.removeEventListener(AI_EVENT, listener)
    },
    onDocumentsChanged: () => () => undefined,
  },
  workspace: {
    pick: async () => null,
    reveal: async () => undefined,
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

/**
 * Browser-mode AI: the same request shape as the main process, but a direct
 * `fetch` from the page. Half of the point of the desktop app is that the key
 * stays out of the renderer; this path exists so `pnpm dev` can preview the
 * assistant, and it is what the settings page reports as "desktop only".
 */
const browserAiControllers = new Map<string, AbortController>()

function readBrowserAiConfig(): AiProviderConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(AI_CONFIG_KEY) ?? 'null') as unknown
    return normalizeBrowserAiConfig(stored) ?? { ...DEFAULT_AI_CONFIG }
  } catch {
    return { ...DEFAULT_AI_CONFIG }
  }
}

function normalizeBrowserAiConfig(value: unknown): AiProviderConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<AiProviderConfig>
  return {
    protocol: candidate.protocol === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: typeof candidate.baseUrl === 'string' ? candidate.baseUrl.trim() : '',
    apiKey: typeof candidate.apiKey === 'string' ? candidate.apiKey : '',
    model: typeof candidate.model === 'string' ? candidate.model.trim() : '',
    temperature: typeof candidate.temperature === 'number' ? candidate.temperature : DEFAULT_AI_CONFIG.temperature,
    maxTokens: typeof candidate.maxTokens === 'number' ? candidate.maxTokens : DEFAULT_AI_CONFIG.maxTokens,
    systemPrompt: typeof candidate.systemPrompt === 'string' ? candidate.systemPrompt : '',
  }
}

function toBrowserAiView(config: AiProviderConfig): AiConfigView {
  return {
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    systemPrompt: config.systemPrompt,
    hasApiKey: config.apiKey.length > 0,
  }
}

function writeBrowserAiConfig(patch: AiConfigPatch): AiProviderConfig {
  const current = readBrowserAiConfig()
  const next: AiProviderConfig = {
    ...current,
    ...('protocol' in patch ? { protocol: patch.protocol ?? current.protocol } : {}),
    ...('baseUrl' in patch ? { baseUrl: patch.baseUrl ?? current.baseUrl } : {}),
    ...('model' in patch ? { model: patch.model ?? current.model } : {}),
    ...('temperature' in patch ? { temperature: patch.temperature ?? current.temperature } : {}),
    ...('maxTokens' in patch ? { maxTokens: patch.maxTokens ?? current.maxTokens } : {}),
    ...('systemPrompt' in patch ? { systemPrompt: patch.systemPrompt ?? current.systemPrompt } : {}),
    ...('apiKey' in patch && patch.apiKey !== undefined ? { apiKey: patch.apiKey ?? '' } : {}),
  }
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(next))
  return next
}

async function browserAiChat(request: AiChatRequest): Promise<AiChatResult> {
  const config = readBrowserAiConfig()
  let text = ''
  let aborted = false
  let error: string | undefined
  let errorCode: AiChatErrorCode | undefined
  const emit = (payload: AiChatEvent): void => {
    if (payload.type === 'delta') text += payload.text
    if (payload.type === 'error') {
      error = payload.message
      errorCode = payload.code
    }
    if (payload.type === 'done' && payload.aborted) aborted = true
    window.dispatchEvent(new CustomEvent(AI_EVENT, { detail: payload }))
  }
  let wire: ReturnType<typeof buildAiChatRequest>
  try {
    wire = buildAiChatRequest(config, request.messages)
  } catch (cause) {
    emit({ requestId: request.requestId, type: 'error', code: 'notConfigured', message: messageOf(cause) })
    return { text, toolCalls: [], aborted, error: messageOf(cause), errorCode: 'notConfigured' }
  }
  const controller = new AbortController()
  browserAiControllers.set(request.requestId, controller)
  try {
    const response = await fetch(wire.url, {
      method: 'POST',
      headers: wire.headers,
      body: JSON.stringify(wire.body),
      signal: controller.signal,
    })
    if (!response.ok) {
      emit({ requestId: request.requestId, type: 'error', code: 'upstream', message: `HTTP ${response.status}` })
      return { text, toolCalls: [], aborted, error: `HTTP ${response.status}`, errorCode: 'upstream' }
    }
    const parser = new AiStreamParser(config.protocol)
    const reader = response.body?.getReader()
    if (!reader) {
      emit({ requestId: request.requestId, type: 'error', code: 'upstream', message: 'Empty response body' })
      return { text, toolCalls: [], aborted, error: 'Empty response body', errorCode: 'upstream' }
    }
    const decoder = new TextDecoder()
    let finished = false
    while (!finished) {
      const { done, value } = await reader.read()
      const events = done ? parser.end() : parser.push(decoder.decode(value, { stream: true }))
      for (const event of events) {
        if (event.type === 'text') emit({ requestId: request.requestId, type: 'delta', text: event.text })
        if (event.type === 'error') emit({ requestId: request.requestId, type: 'error', code: 'upstream', message: event.message })
        if (event.type === 'done' || event.type === 'error') finished = true
      }
      if (done) break
    }
    emit({ requestId: request.requestId, type: 'done' })
    reader.cancel().catch(() => undefined)
  } catch (cause) {
    if (controller.signal.aborted) emit({ requestId: request.requestId, type: 'done', aborted: true })
    else emit({ requestId: request.requestId, type: 'error', code: 'network', message: messageOf(cause) })
  } finally {
    browserAiControllers.delete(request.requestId)
  }
  return { text, toolCalls: [], aborted, ...(error ? { error, errorCode } : {}) }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
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
