import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '../src/renderer/src/stores/ui'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value))
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  get length(): number {
    return this.values.size
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('document', { documentElement: { dataset: {} as Record<string, string> } })
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('focus, theme and companion preferences', () => {
  it('applies focus mode through the shell class contract', () => {
    const ui = useUiStore()
    expect(ui.shellClasses['is-focus-mode']).toBe(false)
    ui.toggleFocusMode()
    expect(ui.focusMode).toBe(true)
    expect(ui.shellClasses['is-focus-mode']).toBe(true)
  })

  it('persists and restores the dark theme', () => {
    const ui = useUiStore()
    ui.setTheme('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(storage.getItem('shizhi.theme')).toBe('dark')

    setActivePinia(createPinia())
    const restored = useUiStore()
    expect(restored.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('toggles companion visibility and content width with persistence', () => {
    const ui = useUiStore()
    ui.toggleCompanion()
    ui.toggleContentWidth()

    expect(ui.companionVisible).toBe(false)
    expect(ui.contentWidth).toBe('wide')
    expect(storage.getItem('shizhi.companion-visible')).toBe('false')
    expect(storage.getItem('shizhi.content-width')).toBe('wide')

    setActivePinia(createPinia())
    const restored = useUiStore()
    expect(restored.companionVisible).toBe(false)
    expect(restored.contentWidth).toBe('wide')
  })

  it('clamps and persists zoom steps', () => {
    const ui = useUiStore()
    for (let index = 0; index < 8; index += 1) ui.adjustZoom(10)
    expect(ui.zoom).toBe(140)
    expect(storage.getItem('shizhi.zoom')).toBe('140')

    for (let index = 0; index < 10; index += 1) ui.adjustZoom(-10)
    expect(ui.zoom).toBe(80)
    expect(storage.getItem('shizhi.zoom')).toBe('80')
  })

  it('keeps a global reduced-motion contract', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles/base.css', import.meta.url), 'utf8')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 0.01ms !important')
    expect(css).toContain('transition-duration: 0.01ms !important')
  })
})
