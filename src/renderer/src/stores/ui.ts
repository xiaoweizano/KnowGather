import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark'
export type ContentWidth = 'comfortable' | 'wide'

export const useUiStore = defineStore('ui', () => {
  const navigationCollapsed = ref(false)
  const sidebarVisible = ref(true)
  const focusMode = ref(false)
  const theme = ref<ThemeMode>(readTheme())
  const companionVisible = ref(readBoolean('shizhi.companion-visible', true))
  const contentWidth = ref<ContentWidth>(readContentWidth())
  const zoom = ref(readZoom())

  applyTheme(theme.value)

  const shellClasses = computed(() => ({
    'is-focus-mode': focusMode.value,
    'is-sidebar-hidden': !sidebarVisible.value,
    'is-navigation-collapsed': navigationCollapsed.value,
    'theme-dark': theme.value === 'dark',
  }))

  function toggleTheme(): void {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    applyTheme(theme.value)
    writeStorage('shizhi.theme', theme.value)
  }

  function setTheme(next: ThemeMode): void {
    theme.value = next
    applyTheme(next)
    writeStorage('shizhi.theme', next)
  }

  function toggleFocusMode(): void {
    focusMode.value = !focusMode.value
  }

  function adjustZoom(delta: number): void {
    zoom.value = Math.min(140, Math.max(80, zoom.value + delta))
    writeStorage('shizhi.zoom', String(zoom.value))
  }

  function resetZoom(): void {
    zoom.value = 100
    writeStorage('shizhi.zoom', '100')
  }

  function toggleCompanion(): void {
    companionVisible.value = !companionVisible.value
    writeStorage('shizhi.companion-visible', String(companionVisible.value))
  }

  function toggleContentWidth(): void {
    contentWidth.value = contentWidth.value === 'comfortable' ? 'wide' : 'comfortable'
    writeStorage('shizhi.content-width', contentWidth.value)
  }

  return {
    navigationCollapsed,
    sidebarVisible,
    focusMode,
    theme,
    companionVisible,
    contentWidth,
    zoom,
    shellClasses,
    toggleTheme,
    setTheme,
    toggleFocusMode,
    adjustZoom,
    resetZoom,
    toggleCompanion,
    toggleContentWidth,
  }
})

function readTheme(): ThemeMode {
  const stored = readStorage('shizhi.theme')
  return stored === 'dark' ? 'dark' : 'light'
}

function readBoolean(key: string, fallback: boolean): boolean {
  const stored = readStorage(key)
  if (stored === 'true') return true
  if (stored === 'false') return false
  return fallback
}

function readContentWidth(): ContentWidth {
  return readStorage('shizhi.content-width') === 'wide' ? 'wide' : 'comfortable'
}

function readZoom(): number {
  const stored = Number(readStorage('shizhi.zoom'))
  return Number.isFinite(stored) ? Math.min(140, Math.max(80, stored)) : 100
}

function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(key)
}

function writeStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, value)
}

function applyTheme(next: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = next
}
