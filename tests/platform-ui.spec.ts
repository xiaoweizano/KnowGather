import { describe, expect, it } from 'vitest'
import { detectDesktopPlatform, formatShortcut, isMacPlatform, showTrafficLights } from '../src/shared/platform'

describe('desktop platform UI', () => {
  it('does not render macOS traffic lights on Windows or Linux', () => {
    expect(showTrafficLights('win32')).toBe(false)
    expect(showTrafficLights('linux')).toBe(false)
    expect(showTrafficLights('darwin')).toBe(true)
  })

  it('detects the desktop platform for the browser fallback', () => {
    expect(detectDesktopPlatform('MacIntel', 'Mozilla/5.0')).toBe('darwin')
    expect(detectDesktopPlatform('Win32', 'Mozilla/5.0')).toBe('win32')
    expect(detectDesktopPlatform('Linux x86_64', 'Mozilla/5.0')).toBe('linux')
  })

  it('formats search shortcuts for the current desktop platform', () => {
    expect(isMacPlatform('darwin')).toBe(true)
    expect(formatShortcut('darwin', 'K')).toBe('⌘ K')
    expect(formatShortcut('win32', 'K')).toBe('Ctrl K')
    expect(formatShortcut('linux', 'K')).toBe('Ctrl K')
  })
})
