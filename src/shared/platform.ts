export type DesktopPlatform = 'darwin' | 'win32' | 'linux' | 'freebsd' | 'openbsd' | 'sunos' | 'aix' | 'android'

export function isMacPlatform(platform: string): boolean {
  return platform === 'darwin'
}

export function showTrafficLights(platform: string): boolean {
  return isMacPlatform(platform)
}

export function formatShortcut(platform: string, key: string): string {
  return isMacPlatform(platform) ? `⌘ ${key}` : `Ctrl ${key}`
}

export function detectDesktopPlatform(navigatorPlatform: string, userAgent: string): DesktopPlatform {
  const value = `${navigatorPlatform} ${userAgent}`.toLowerCase()
  if (value.includes('mac')) return 'darwin'
  if (value.includes('win')) return 'win32'
  return 'linux'
}
