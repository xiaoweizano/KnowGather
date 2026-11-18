import { locale, setLocale, translate, type Locale, type MessageParams } from './index'

/**
 * Composable wrapper used by components. `t` is a plain function rather than a
 * computed so it can be called with dynamic keys and parameters inline.
 */
export function useI18n(): {
  t: (key: string, params?: MessageParams) => string
  locale: typeof locale
  setLocale: (next: Locale) => void
} {
  return {
    t: (key, params) => translate(key, params),
    locale,
    setLocale,
  }
}
