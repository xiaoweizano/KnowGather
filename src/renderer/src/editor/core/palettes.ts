/**
 * Colour palettes for the toolbar pickers.
 *
 * The layout follows Yuque's panel: a neutral row, then a 10 × 5 hue grid
 * (vivid → pale → light → mid → dark), then gradients and recently used
 * colours. A regular grid is faster to aim at than a list of named colours,
 * and every swatch carries its own label for screen readers.
 */

export interface PaletteSwatch {
  /** CSS value; `null` means "clear". */
  value: string | null
  labelKey: string
  /** Optional gradient for the few decorative "gradient" swatches. */
  gradient?: string
}

interface Hue {
  labelKey: string
  /** Five steps, ordered the way the panel shows them: vivid → dark. */
  steps: readonly [string, string, string, string, string]
}

/** Ten hues × five lightness steps, matching Yuque's grid. */
export const COLOR_HUES: readonly Hue[] = [
  { labelKey: 'editor.palette.red', steps: ['#e8483f', '#fde8e8', '#f7b9b7', '#d23a35', '#9b2420'] },
  { labelKey: 'editor.palette.orange', steps: ['#f07f22', '#feeee0', '#fbd0a8', '#d9690f', '#a44a06'] },
  { labelKey: 'editor.palette.yellow', steps: ['#f0b400', '#fef6d9', '#fbe49b', '#cf9a00', '#9c7200'] },
  { labelKey: 'editor.palette.lime', steps: ['#8bc31f', '#eef7d9', '#d5ea9f', '#6fa216', '#4f7a0d'] },
  { labelKey: 'editor.palette.green', steps: ['#27b06a', '#e2f5ea', '#a8e0c6', '#1d8f56', '#12663c'] },
  { labelKey: 'editor.palette.teal', steps: ['#17b3b3', '#ddf5f4', '#9fdedd', '#0f8f8f', '#086767'] },
  { labelKey: 'editor.palette.cyan', steps: ['#1a9fe0', '#e0f1fb', '#a5d9f3', '#107fc0', '#0a5d8f'] },
  { labelKey: 'editor.palette.blue', steps: ['#3176f0', '#e5edfd', '#b0c9f8', '#2159c9', '#163f96'] },
  { labelKey: 'editor.palette.violet', steps: ['#6a4ce0', '#eae5fb', '#c2b4f2', '#5533c4', '#3d238f'] },
  { labelKey: 'editor.palette.purple', steps: ['#b93ecc', '#f7e4f9', '#e5b0ee', '#9729a8', '#6d1a7c'] },
]

/** Ten neutral swatches, black to white, above the hue grid. */
export const COLOR_NEUTRALS: readonly PaletteSwatch[] = [
  { value: '#000000', labelKey: 'editor.palette.black' },
  { value: '#3f3f46', labelKey: 'editor.palette.darkGray' },
  { value: '#6b6b75', labelKey: 'editor.palette.midGray' },
  { value: '#a1a1ab', labelKey: 'editor.palette.lightGray' },
  { value: '#c8c8d0', labelKey: 'editor.palette.palerGray' },
  { value: '#dedee4', labelKey: 'editor.palette.paleGray' },
  { value: '#ececef', labelKey: 'editor.palette.faintGray' },
  { value: '#f4f4f7', labelKey: 'editor.palette.whisperGray' },
  { value: '#fafafb', labelKey: 'editor.palette.nearWhite' },
  { value: '#ffffff', labelKey: 'editor.palette.white' },
]

/** The hue grid, column-major: each entry is one column of five swatches. */
export const COLOR_GRID: readonly { labelKey: string; swatches: PaletteSwatch[] }[] = COLOR_HUES.map((hue) => ({
  labelKey: hue.labelKey,
  swatches: hue.steps.map((value) => ({ value, labelKey: hue.labelKey })),
}))

export const TEXT_GRADIENTS: readonly PaletteSwatch[] = [
  { value: null, labelKey: 'editor.palette.gradientBlue', gradient: 'linear-gradient(135deg, #31aede, #4c86e8)' },
  { value: null, labelKey: 'editor.palette.gradientViolet', gradient: 'linear-gradient(135deg, #9462e6, #e2589f)' },
  { value: null, labelKey: 'editor.palette.gradientSunset', gradient: 'linear-gradient(135deg, #f68434, #e2589f)' },
  { value: null, labelKey: 'editor.palette.gradientMint', gradient: 'linear-gradient(135deg, #41b07c, #31b0aa)' },
]

/**
 * A gradient swatch cannot be a plain `color` mark value, so it fills with the
 * first stop: the closest thing an inline text mark can represent.
 */
export function gradientTextColor(swatch: PaletteSwatch): string | null {
  const match = swatch.gradient?.match(/#[0-9a-f]{3,8}/i)
  return match ? match[0] : null
}

/** Black or white, whichever reads better on the given hex colour. */
export function contrastOn(value: string): string {
  const hex = value.replace('#', '')
  const full = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16) || 0)
  // Relative luminance, simplified: enough to pick a readable tick colour.
  const luminance = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255
  return luminance > 0.62 ? '#1b1a1f' : '#ffffff'
}

/* ------------------------------------------------------- recent custom colours */

const RECENT_KEY = 'shizhi.editor.recent-colors'
const RECENT_LIMIT = 8

/** Most recent custom picks, newest first; empty when storage is unavailable. */
export function readRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

/** Puts `value` at the front of the recent list and persists the result. */
export function rememberRecentColor(value: string): string[] {
  const next = [value, ...readRecentColors().filter((entry) => entry !== value)].slice(0, RECENT_LIMIT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Remembering picks is a convenience; failing to store must not break the paint.
  }
  return next
}

/** Font sizes offered in the picker, in CSS pixels. */
export const FONT_SIZES: readonly string[] = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px']

/** The size a fresh document uses; "default" clears the override. */
export const DEFAULT_FONT_SIZE = '16px'
