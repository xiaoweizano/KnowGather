export type AppLocale = 'zh-CN' | 'en-US'

/**
 * Application-level settings that the main process must know about (tray,
 * window behaviour, auto launch, update feed). Pure UI preferences stay in the
 * renderer's `ui` store so they can apply without an IPC round-trip.
 */
export interface AppSettings {
  locale: AppLocale
  autoLaunch: boolean
  silentStart: boolean
  hideFromTaskbar: boolean
  minimizeToTray: boolean
  closeToTray: boolean
  autoCheckUpdates: boolean
  updateFeedUrl: string
}

export type AppSettingsPatch = Partial<AppSettings>

export const DEFAULT_APP_SETTINGS: AppSettings = {
  locale: 'zh-CN',
  autoLaunch: false,
  silentStart: false,
  hideFromTaskbar: false,
  minimizeToTray: false,
  closeToTray: false,
  autoCheckUpdates: false,
  updateFeedUrl: '',
}

export interface AppInfo {
  version: string
  platform: string
  electron: string
  chrome: string
  packaged: boolean
}

export interface AutoLaunchState {
  enabled: boolean
  supported: boolean
}

export interface ActivityDay {
  edits: number
  journals: number
  characters: number
}

/** Day keys are local calendar dates formatted as `YYYY-MM-DD`. */
export interface ActivityPayload {
  days: Record<string, ActivityDay>
  seeded: boolean
}

export type UpdateStatus = 'up-to-date' | 'available' | 'not-configured' | 'error'

export interface UpdateCheckResult {
  status: UpdateStatus
  currentVersion: string
  latestVersion?: string
  notes?: string
  url?: string
  message?: string
}

export const MAX_UPDATE_FEED_LENGTH = 2048

export function normalizeAppSettings(input: unknown): AppSettings {
  const candidate = isRecord(input) ? input : {}
  return {
    locale: candidate.locale === 'en-US' ? 'en-US' : 'zh-CN',
    autoLaunch: candidate.autoLaunch === true,
    silentStart: candidate.silentStart === true,
    hideFromTaskbar: candidate.hideFromTaskbar === true,
    minimizeToTray: candidate.minimizeToTray === true,
    closeToTray: candidate.closeToTray === true,
    autoCheckUpdates: candidate.autoCheckUpdates === true,
    updateFeedUrl: normalizeFeedUrl(candidate.updateFeedUrl),
  }
}

export function validateAppSettingsPatch(value: unknown): AppSettingsPatch {
  if (!isRecord(value)) throw new TypeError('Invalid settings patch')
  const patch: AppSettingsPatch = {}
  if ('locale' in value) {
    if (value.locale !== 'zh-CN' && value.locale !== 'en-US') throw new TypeError('Invalid locale')
    patch.locale = value.locale
  }
  for (const key of ['autoLaunch', 'silentStart', 'hideFromTaskbar', 'minimizeToTray', 'closeToTray', 'autoCheckUpdates'] as const) {
    if (key in value) {
      if (typeof value[key] !== 'boolean') throw new TypeError(`Invalid ${key}`)
      patch[key] = value[key]
    }
  }
  if ('updateFeedUrl' in value) patch.updateFeedUrl = normalizeFeedUrl(value.updateFeedUrl)
  return patch
}

export function normalizeFeedUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().slice(0, MAX_UPDATE_FEED_LENGTH)
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

/** Local calendar date key, deliberately not UTC. */
export function localDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * ISO timestamp for local noon on a `YYYY-MM-DD` key.
 *
 * Noon rather than midnight because the value is stored in UTC: midnight local
 * can land on the previous day once the offset is applied, which would shift a
 * backdated import onto the wrong heatmap cell.
 */
export function dayKeyToLocalNoonIso(dayKey: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
