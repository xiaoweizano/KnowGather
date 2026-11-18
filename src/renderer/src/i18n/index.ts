import { computed, ref, watch } from 'vue'
import zhCN from './zh-CN'
import enUS from './en-US'

export type Locale = 'zh-CN' | 'en-US'

export type MessageValue = string | number

/** Flat `a.b.c` → text dictionaries. Nested objects are deliberately avoided so
 * key lookups stay a single map access and a missing key is easy to spot. */
export type Messages = Record<string, string>

/** `t()` supports `{name}` placeholders filled from this record. */
export type MessageParams = Record<string, MessageValue>

const STORAGE_KEY = 'shizhi.locale'

export const SUPPORTED_LOCALES: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
]

const dictionaries: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

const activeLocale = ref<Locale>(readLocale())

/** Reactive current locale, so templates re-render on switch. */
export const locale = computed(() => activeLocale.value)

export function setLocale(next: Locale): void {
  activeLocale.value = next
}

export function currentLocale(): Locale {
  return activeLocale.value
}

export function messagesFor(next: Locale): Messages {
  return dictionaries[next]
}

/**
 * Resolves a message. Missing keys fall back to the Chinese dictionary and then
 * to the key itself, so an untranslated string is visible rather than blank.
 */
export function translate(key: string, params?: MessageParams): string {
  return translateIn(activeLocale.value, key, params)
}

/** Same lookup, but for an explicitly requested locale (used by formatters). */
export function translateIn(target: Locale, key: string, params?: MessageParams): string {
  const template = dictionaries[target][key] ?? dictionaries['zh-CN'][key]
  if (template === undefined) {
    if (typeof console !== 'undefined') console.warn(`[i18n] missing key: ${key}`)
    return key
  }
  return interpolate(template, params)
}

export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/** Formats a date with the active locale; invalid input yields a translated label. */
export function formatDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
  fallbackLabel?: string,
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return fallbackLabel ?? translate('time.unknown')
  return new Intl.DateTimeFormat(activeLocale.value, options).format(date)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(activeLocale.value).format(value)
}

function readLocale(): Locale {
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    if (stored === 'en-US' || stored === 'zh-CN') return stored
    const browser = typeof navigator === 'undefined' ? '' : navigator.language ?? ''
    return browser.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

function persistLocale(next: Locale): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage is optional in tests and private browsing; the in-memory value still applies.
  }
}

watch(activeLocale, (next) => {
  persistLocale(next)
  if (typeof document !== 'undefined') document.documentElement.lang = next
})

// Apply on module load so the very first paint already has the right `lang`.
if (typeof document !== 'undefined') document.documentElement.lang = activeLocale.value
