import { join } from 'node:path'

export interface WindowConfigInput {
  platform: string
  appRoot: string
  /** Absolute path to the packaged icon, when one is available. */
  iconPath?: string
}

/**
 * Electron adds a default File/Edit/View/Window menu on Windows and Linux. The
 * app draws its own chrome and every command already lives in the UI, so the
 * bar is dead weight — and on Windows it eats a strip of the window.
 *
 * macOS keeps its menu: the system menu bar carries Cmd+C/V/Q. A dev server
 * keeps it too, because that menu is where Alt/Ctrl+Shift+I and Ctrl+R live.
 */
export function shouldDropApplicationMenu(platform: string, devServerUrl?: string): boolean {
  return platform !== 'darwin' && !devServerUrl
}

export function createWindowOptions({ platform, appRoot, iconPath }: WindowConfigInput) {
  const mac = platform === 'darwin'
  return {
    width: 1402,
    height: 1122,
    minWidth: 960,
    minHeight: 720,
    ...(mac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } } : { frame: true }),
    // Windows and Linux take the window icon from this; macOS ignores it and
    // uses the bundle icon instead.
    ...(iconPath && !mac ? { icon: iconPath } : {}),
    backgroundColor: '#f5f4fb',
    webPreferences: {
      preload: join(appRoot, 'out/preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
}
