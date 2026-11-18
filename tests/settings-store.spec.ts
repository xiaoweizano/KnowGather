import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { compareVersions, interpretFeed } from '../src/main/updateService'
import { SettingsStore } from '../src/main/settingsStore'
import { ActivityStore } from '../src/main/activityStore'
import { localDayKey } from '../src/shared/settings'

describe('version comparison', () => {
  it('compares dotted numeric versions segment by segment', () => {
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2.0')).toBe(1)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('2.0', '1.9.9')).toBe(1)
    expect(compareVersions('v1.3', '1.2.9')).toBe(1)
  })

  it('treats a prerelease suffix as lower than its release', () => {
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBeLessThan(0)
  })
})

describe('update feed interpretation', () => {
  it('reports up-to-date when the feed is not newer', () => {
    expect(interpretFeed({ version: '0.1.0', url: 'https://example.com/a.exe' }, '0.1.0', 'https://f'))
      .toMatchObject({ status: 'up-to-date', latestVersion: '0.1.0' })
  })

  it('reports an available update with its download link', () => {
    expect(interpretFeed({ version: '0.2.0', url: 'https://example.com/a.exe', notes: 'New stuff' }, '0.1.0', 'https://f'))
      .toMatchObject({ status: 'available', latestVersion: '0.2.0', url: 'https://example.com/a.exe', notes: 'New stuff' })
  })

  it('flags a feed without a version or download URL honestly', () => {
    expect(interpretFeed({}, '0.1.0', 'https://f').status).toBe('error')
    const noUrl = interpretFeed({ version: '0.2.0' }, '0.1.0', 'https://f')
    expect(noUrl.status).toBe('available')
    expect(noUrl.url).toBeUndefined()
    expect(noUrl.message).toContain('https://f')
  })
})

describe('settings store', () => {
  it('round-trips settings and falls back to defaults for a corrupt file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'shizhi-settings-'))
    try {
      const store = new SettingsStore(directory)
      expect(await store.get()).toMatchObject({ locale: 'zh-CN', autoLaunch: false })

      const updated = await store.update({ locale: 'en-US', closeToTray: true, updateFeedUrl: 'https://example.com/feed.json' })
      expect(updated).toMatchObject({ locale: 'en-US', closeToTray: true })

      const reloaded = new SettingsStore(directory)
      expect(await reloaded.get()).toMatchObject({ locale: 'en-US', closeToTray: true })

      await writeFile(path.join(directory, 'shizhi-settings.json'), '{not json', 'utf8')
      const corrupt = new SettingsStore(directory)
      expect(await corrupt.get()).toMatchObject({ locale: 'zh-CN', closeToTray: false })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects invalid values instead of persisting them', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'shizhi-settings-'))
    try {
      const store = new SettingsStore(directory)
      await expect(store.update({ locale: 'fr-FR' as never })).rejects.toThrow(/locale/i)
      await expect(store.update({ closeToTray: 'yes' as never })).rejects.toThrow(/closeToTray/i)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('activity store', () => {
  it('records daily edits, keeps its own file and seeds history once', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'shizhi-activity-'))
    try {
      const store = new ActivityStore(directory)
      const now = new Date(2026, 10, 17, 10, 0)
      await store.record({ kind: 'document', characters: 12, now })
      await store.record({ kind: 'journal', characters: 4, now })

      const payload = await store.list()
      const key = localDayKey(now)
      expect(payload.days[key]).toEqual({ edits: 2, journals: 1, characters: 16 })
      expect(payload.seeded).toBe(true)

      // The database file must not be touched: the activity lives separately.
      await expect(readFile(path.join(directory, 'shizhi-documents.json'), 'utf8')).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('seeds one edit per day from existing records on first read', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'shizhi-activity-'))
    try {
      const store = new ActivityStore(directory)
      const payload = await store.list([
        { createdAt: '2026-11-10T09:00:00.000Z', updatedAt: new Date(2026, 10, 12, 9).toISOString() },
        { createdAt: '2026-11-11T09:00:00.000Z', updatedAt: new Date(2026, 10, 12, 18).toISOString() },
      ])

      expect(payload.days[localDayKey(new Date(2026, 10, 12))]?.edits).toBe(1)
      expect(payload.seeded).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
