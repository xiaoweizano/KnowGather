import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { locale, setLocale as applyLocale, type Locale } from '../i18n'

export type ThemeMode = 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type ThemePreference = ResolvedTheme | 'system'
export type ContentWidth = 'comfortable' | 'wide'
export type AccentColor = 'violet' | 'mint' | 'cream' | 'sakura' | 'ocean'
export type MotionPreference = 'full' | 'reduced' | 'off'
export type CompanionStyle = 'cat' | 'dog' | 'rabbit' | 'panda' | 'custom'

export const ACCENT_OPTIONS: ReadonlyArray<AccentColor> = ['violet', 'mint', 'cream', 'sakura', 'ocean']
export const COMPANION_STYLES: ReadonlyArray<Exclude<CompanionStyle, 'custom'>> = ['cat', 'dog', 'rabbit', 'panda']
export const MOTION_OPTIONS: ReadonlyArray<MotionPreference> = ['full', 'reduced', 'off']

/** Font choices are a fixed list so the CSS variables stay predictable. */
export const FONT_OPTIONS: ReadonlyArray<{ value: string; label: string; css: string }> = [
  { value: 'system', label: 'system', css: '' },
  { value: 'aptos', label: 'Aptos', css: '"Aptos", "Segoe UI", sans-serif' },
  { value: 'segoe', label: 'Segoe UI', css: '"Segoe UI", sans-serif' },
  { value: 'pingfang', label: 'PingFang SC', css: '"PingFang SC", "Hiragino Sans GB", sans-serif' },
  { value: 'yahei', label: 'Microsoft YaHei', css: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif' },
  { value: 'noto', label: 'Noto Sans SC', css: '"Noto Sans SC", "Source Han Sans SC", sans-serif' },
  { value: 'serif', label: 'Serif', css: 'Georgia, "Songti SC", "SimSun", serif' },
]

export const CODE_FONT_OPTIONS: ReadonlyArray<{ value: string; label: string; css: string }> = [
  { value: 'system', label: 'system', css: '' },
  { value: 'cascadia', label: 'Cascadia Code', css: '"Cascadia Code", "Cascadia Mono", Consolas, monospace' },
  { value: 'consolas', label: 'Consolas', css: 'Consolas, "Courier New", monospace' },
  { value: 'jetbrains', label: 'JetBrains Mono', css: '"JetBrains Mono", "Fira Code", monospace' },
  { value: 'sfmono', label: 'SF Mono', css: '"SFMono-Regular", Menlo, monospace' },
]

const DEFAULT_UI_FONT = '"Aptos", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif'
const DEFAULT_BODY_FONT = '"Aptos", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif'
const DEFAULT_CODE_FONT = '"Cascadia Code", "SFMono-Regular", Consolas, monospace'

export const useUiStore = defineStore('ui', () => {
  const navigationCollapsed = ref(false)
  const sidebarVisible = ref(true)
  const focusMode = ref(false)
  // `theme` stays the resolved light/dark value so existing callers and tests
  // keep working; `themePreference` is the user's choice and may be 'system'.
  const themePreference = ref<ThemePreference>(readThemePreference())
  const systemDark = ref(readSystemDark())
  const theme = computed<ResolvedTheme>(() =>
    themePreference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : themePreference.value)
  const accent = ref<AccentColor>(readAccent())
  const motion = ref<MotionPreference>(readMotion())
  const companionVisible = ref(readBoolean('shizhi.companion-visible', true))
  const companionStyle = ref<CompanionStyle>(readCompanionStyle())
  const customCompanionUrl = ref(readStorage('shizhi.companion-url') ?? '')
  const contentWidth = ref<ContentWidth>(readContentWidth())
  const zoom = ref(readZoom())
  const sidebarWidth = ref(readSidebarWidth())
  const navigationWidth = ref(readNavigationWidth())
  const uiFont = ref(readFont('shizhi.font.ui', 'system'))
  const bodyFont = ref(readFont('shizhi.font.body', 'system'))
  const codeFont = ref(readFont('shizhi.font.code', 'cascadia'))
  const uiFontSize = ref(readNumber('shizhi.font-size.ui', 13, 10, 20))
  const bodyFontSize = ref(readNumber('shizhi.font-size.body', 16, 12, 28))
  const lineHeight = ref(readNumber('shizhi.line-height', 1.72, 1.3, 2.4, 0.01))
  const paragraphSpacing = ref(readNumber('shizhi.paragraph-spacing', 0.42, 0, 1.6, 0.01))
  const outlineVisible = ref(readBoolean('shizhi.outline-visible', true))
  const foldHeadings = ref(readBoolean('shizhi.fold-headings', true))
  const showLineNumbers = ref(readBoolean('shizhi.show-line-numbers', false))
  const indentGuides = ref(readBoolean('shizhi.indent-guides', false))
  const hangingIndent = ref(readBoolean('shizhi.hanging-indent', false))

  applyAppearance()

  const shellClasses = computed(() => ({
    'is-focus-mode': focusMode.value,
    'is-sidebar-hidden': !sidebarVisible.value,
    'is-navigation-collapsed': navigationCollapsed.value,
    'theme-dark': theme.value === 'dark',
  }))

  const shellStyle = computed<Record<string, string>>(() => ({
    '--navigation-width': `${navigationWidth.value}px`,
    '--sidebar-width': `${sidebarWidth.value}px`,
    '--ui-font': uiFontCss(uiFont.value),
    '--editor-font': bodyFontCss(bodyFont.value),
    '--editor-code-font': codeFontCss(codeFont.value),
    '--ui-font-size': `${uiFontSize.value}px`,
    '--editor-font-size': `${bodyFontSize.value}px`,
    '--editor-line-height': String(lineHeight.value),
    '--editor-paragraph-spacing': `${paragraphSpacing.value}em`,
  }))

  const motionEnabled = computed(() => motion.value !== 'off')

  function toggleTheme(): void {
    setTheme(theme.value === 'light' ? 'dark' : 'light')
  }

  function setTheme(next: ThemeMode): void {
    themePreference.value = next
    // Existing callers and tests use `shizhi.theme`; keep it as the resolved value.
    writeStorage('shizhi.theme', next)
    writeStorage('shizhi.theme-preference', next)
    applyTheme()
  }

  function setThemePreference(next: ThemePreference): void {
    themePreference.value = next
    writeStorage('shizhi.theme-preference', next)
    applyTheme()
  }

  function setAccent(next: AccentColor): void {
    accent.value = next
    writeStorage('shizhi.accent', next)
    applyAppearance()
  }

  function setMotion(next: MotionPreference): void {
    motion.value = next
    writeStorage('shizhi.motion', next)
    applyAppearance()
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

  function setCompanionStyle(next: CompanionStyle): void {
    companionStyle.value = next
    writeStorage('shizhi.companion-style', next)
  }

  function setCustomCompanion(url: string): void {
    customCompanionUrl.value = url
    writeStorage('shizhi.companion-url', url)
    if (url) setCompanionStyle('custom')
  }

  function clearCustomCompanion(): void {
    customCompanionUrl.value = ''
    writeStorage('shizhi.companion-url', '')
    if (companionStyle.value === 'custom') setCompanionStyle('cat')
  }

  function toggleContentWidth(): void {
    contentWidth.value = contentWidth.value === 'comfortable' ? 'wide' : 'comfortable'
    writeStorage('shizhi.content-width', contentWidth.value)
  }

  function setContentWidth(next: ContentWidth): void {
    contentWidth.value = next
    writeStorage('shizhi.content-width', next)
  }

  function setSidebarWidth(width: number): void {
    const next = clampSidebarWidth(width)
    sidebarWidth.value = next
    writeStorage('shizhi.sidebar-width', String(next))
  }

  function resetSidebarWidth(): void {
    sidebarWidth.value = DEFAULT_SIDEBAR_WIDTH
    writeStorage('shizhi.sidebar-width', String(DEFAULT_SIDEBAR_WIDTH))
  }

  function setNavigationWidth(width: number): void {
    const next = clampNavigationWidth(width)
    navigationWidth.value = next
    writeStorage('shizhi.navigation-width', String(next))
  }

  function resetNavigationWidth(): void {
    navigationWidth.value = DEFAULT_NAVIGATION_WIDTH
    writeStorage('shizhi.navigation-width', String(DEFAULT_NAVIGATION_WIDTH))
  }

  function setLocalePreference(next: Locale): void {
    applyLocale(next)
  }

  function setUiFont(value: string): void {
    uiFont.value = value
    writeStorage('shizhi.font.ui', value)
  }

  function setBodyFont(value: string): void {
    bodyFont.value = value
    writeStorage('shizhi.font.body', value)
  }

  function setCodeFont(value: string): void {
    codeFont.value = value
    writeStorage('shizhi.font.code', value)
  }

  function setUiFontSize(value: number): void {
    uiFontSize.value = clampNumber(value, 10, 20)
    writeStorage('shizhi.font-size.ui', String(uiFontSize.value))
  }

  function setBodyFontSize(value: number): void {
    bodyFontSize.value = clampNumber(value, 12, 28)
    writeStorage('shizhi.font-size.body', String(bodyFontSize.value))
  }

  function setLineHeight(value: number): void {
    lineHeight.value = clampNumber(value, 1.3, 2.4, 2)
    writeStorage('shizhi.line-height', String(lineHeight.value))
  }

  function setParagraphSpacing(value: number): void {
    paragraphSpacing.value = clampNumber(value, 0, 1.6, 2)
    writeStorage('shizhi.paragraph-spacing', String(paragraphSpacing.value))
  }

  function setOutlineVisible(value: boolean): void {
    outlineVisible.value = value
    writeStorage('shizhi.outline-visible', String(value))
  }

  function toggleOutline(): void {
    setOutlineVisible(!outlineVisible.value)
  }

  function setFoldHeadings(value: boolean): void {
    foldHeadings.value = value
    writeStorage('shizhi.fold-headings', String(value))
  }

  function setShowLineNumbers(value: boolean): void {
    showLineNumbers.value = value
    writeStorage('shizhi.show-line-numbers', String(value))
  }

  function setIndentGuides(value: boolean): void {
    indentGuides.value = value
    writeStorage('shizhi.indent-guides', String(value))
  }

  function setHangingIndent(value: boolean): void {
    hangingIndent.value = value
    writeStorage('shizhi.hanging-indent', String(value))
  }

  function applyTheme(): void {
    applyAppearance()
  }

  function applyAppearance(): void {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.theme = theme.value
    root.dataset.accent = accent.value
    root.dataset.motion = motion.value
    // Test doubles stub `documentElement` with only `dataset`; CSS custom
    // properties are a progressive enhancement, not a requirement.
    const style = root.style
    if (!style || typeof style.setProperty !== 'function') return
    style.setProperty('--ui-font', uiFontCss(uiFont.value))
    style.setProperty('--editor-font', bodyFontCss(bodyFont.value))
    style.setProperty('--editor-code-font', codeFontCss(codeFont.value))
    style.setProperty('--ui-font-size', `${uiFontSize.value}px`)
    style.setProperty('--editor-font-size', `${bodyFontSize.value}px`)
    style.setProperty('--editor-line-height', String(lineHeight.value))
    style.setProperty('--editor-paragraph-spacing', `${paragraphSpacing.value}em`)
  }

  // Keep the resolved theme in sync when the OS preference changes.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (event: MediaQueryListEvent | MediaQueryList): void => {
      systemDark.value = event.matches
      if (themePreference.value === 'system') applyAppearance()
    }
    query.addEventListener?.('change', update)
  }

  watch(theme, () => {
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme.value
  })

  return {
    navigationCollapsed,
    sidebarVisible,
    focusMode,
    theme,
    themePreference,
    accent,
    motion,
    motionEnabled,
    companionVisible,
    companionStyle,
    customCompanionUrl,
    contentWidth,
    zoom,
    sidebarWidth,
    navigationWidth,
    uiFont,
    bodyFont,
    codeFont,
    uiFontSize,
    bodyFontSize,
    lineHeight,
    paragraphSpacing,
    outlineVisible,
    foldHeadings,
    showLineNumbers,
    indentGuides,
    hangingIndent,
    locale,
    shellClasses,
    shellStyle,
    toggleTheme,
    setTheme,
    setThemePreference,
    setAccent,
    setMotion,
    toggleFocusMode,
    adjustZoom,
    resetZoom,
    toggleCompanion,
    setCompanionStyle,
    setCustomCompanion,
    clearCustomCompanion,
    toggleContentWidth,
    setContentWidth,
    setSidebarWidth,
    resetSidebarWidth,
    setNavigationWidth,
    resetNavigationWidth,
    setLocalePreference,
    setUiFont,
    setBodyFont,
    setCodeFont,
    setUiFontSize,
    setBodyFontSize,
    setLineHeight,
    setParagraphSpacing,
    setOutlineVisible,
    toggleOutline,
    setFoldHeadings,
    setShowLineNumbers,
    setIndentGuides,
    setHangingIndent,
    applyAppearance,
  }
})

export const DEFAULT_SIDEBAR_WIDTH = 302
export const DEFAULT_NAVIGATION_WIDTH = 116
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 460
export const MIN_NAVIGATION_WIDTH = 72
export const MAX_NAVIGATION_WIDTH = 180

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH
  return Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width)))
}

export function clampNavigationWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_NAVIGATION_WIDTH
  return Math.round(Math.min(MAX_NAVIGATION_WIDTH, Math.max(MIN_NAVIGATION_WIDTH, width)))
}

export function uiFontCss(value: string): string {
  return FONT_OPTIONS.find((option) => option.value === value)?.css || DEFAULT_UI_FONT
}

export function bodyFontCss(value: string): string {
  return FONT_OPTIONS.find((option) => option.value === value)?.css || DEFAULT_BODY_FONT
}

export function codeFontCss(value: string): string {
  return CODE_FONT_OPTIONS.find((option) => option.value === value)?.css || DEFAULT_CODE_FONT
}

function clampNumber(value: number, min: number, max: number, precision = 0): number {
  if (!Number.isFinite(value)) return min
  const clamped = Math.min(max, Math.max(min, value))
  return precision > 0 ? Math.round(clamped / precision) * precision : Math.round(clamped)
}

function readSidebarWidth(): number {
  return clampSidebarWidth(Number(readStorage('shizhi.sidebar-width')) || DEFAULT_SIDEBAR_WIDTH)
}

function readNavigationWidth(): number {
  return clampNavigationWidth(Number(readStorage('shizhi.navigation-width')) || DEFAULT_NAVIGATION_WIDTH)
}

function readThemePreference(): ThemePreference {
  const preference = readStorage('shizhi.theme-preference')
  if (preference === 'system') return 'system'
  if (preference === 'dark' || preference === 'light') return preference
  return readStorage('shizhi.theme') === 'dark' ? 'dark' : 'light'
}

function readSystemDark(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  } catch {
    return false
  }
}

function readAccent(): AccentColor {
  const stored = readStorage('shizhi.accent')
  return ACCENT_OPTIONS.includes(stored as AccentColor) ? stored as AccentColor : 'violet'
}

function readMotion(): MotionPreference {
  const stored = readStorage('shizhi.motion')
  return MOTION_OPTIONS.includes(stored as MotionPreference) ? stored as MotionPreference : 'full'
}

function readCompanionStyle(): CompanionStyle {
  const stored = readStorage('shizhi.companion-style')
  if (stored === 'custom') return stored
  return COMPANION_STYLES.includes(stored as Exclude<CompanionStyle, 'custom'>)
    ? stored as CompanionStyle
    : 'cat'
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

function readFont(key: string, fallback: string): string {
  const stored = readStorage(key)
  return stored || fallback
}

function readNumber(key: string, fallback: number, min: number, max: number, precision = 0): number {
  const stored = Number(readStorage(key))
  if (!Number.isFinite(stored) || readStorage(key) === null) return fallback
  return clampNumber(stored, min, max, precision)
}

function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(key)
}

function writeStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, value)
}
