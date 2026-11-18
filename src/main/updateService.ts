import { normalizeFeedUrl, type UpdateCheckResult } from '../shared/settings.js'

export interface UpdateFeedDocument {
  version?: unknown
  url?: unknown
  notes?: unknown
}

export interface UpdateCheckOptions {
  feedUrl: string | null | undefined
  currentVersion: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 8000

/**
 * Checks a user-configured update feed.
 *
 * There is no bundled update server, so this deliberately reports
 * `not-configured` rather than pretending to have checked. When a feed is set,
 * the JSON it returns is compared against the running version and the download
 * URL is surfaced to the user; nothing is downloaded or installed silently.
 */
export async function checkForUpdates(options: UpdateCheckOptions): Promise<UpdateCheckResult> {
  const feedUrl = normalizeFeedUrl(options.feedUrl)
  if (!feedUrl) {
    return {
      status: 'not-configured',
      currentVersion: options.currentVersion,
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS) : null

  try {
    const response = await fetchImpl(feedUrl, {
      headers: { accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    })
    if (!response.ok) {
      return {
        status: 'error',
        currentVersion: options.currentVersion,
        message: `HTTP ${response.status}`,
      }
    }
    const payload = await response.json() as UpdateFeedDocument
    return interpretFeed(payload, options.currentVersion, feedUrl)
  } catch (error) {
    return {
      status: 'error',
      currentVersion: options.currentVersion,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function interpretFeed(
  payload: UpdateFeedDocument,
  currentVersion: string,
  feedUrl: string,
): UpdateCheckResult {
  const latestVersion = typeof payload.version === 'string' ? payload.version.trim() : ''
  if (!latestVersion) {
    return { status: 'error', currentVersion, message: 'Feed has no version field' }
  }
  const notes = typeof payload.notes === 'string' ? payload.notes.slice(0, 4000) : undefined
  const url = typeof payload.url === 'string' && /^https?:\/\//i.test(payload.url.trim())
    ? payload.url.trim()
    : undefined

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return { status: 'up-to-date', currentVersion, latestVersion }
  }
  return {
    status: 'available',
    currentVersion,
    latestVersion,
    ...(url ? { url } : {}),
    ...(notes ? { notes } : {}),
    ...(url ? {} : { message: `No download URL in ${feedUrl}` }),
  }
}

/**
 * Numeric, segment-wise comparison of dotted versions. A missing segment counts
 * as zero (`1.2` == `1.2.0`), and a prerelease suffix (`1.2.0-beta`) sorts
 * below its release (`1.2.0`) as semver expects.
 */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): { numbers: number[]; prerelease: boolean } => {
    const cleaned = value.replace(/^v/i, '')
    const [core, ...rest] = cleaned.split('-')
    const numbers = (core ?? '')
      .split(/[.+]/)
      .map((segment) => {
        const match = /^\d+/.exec(segment)
        return match ? Number(match[0]) : 0
      })
    return { numbers, prerelease: rest.length > 0 }
  }

  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.numbers.length, b.numbers.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (a.numbers[index] ?? 0) - (b.numbers[index] ?? 0)
    if (difference !== 0) return difference > 0 ? 1 : -1
  }
  // Same numeric core: a prerelease is older than the final release.
  if (a.prerelease !== b.prerelease) return a.prerelease ? -1 : 1
  return 0
}
