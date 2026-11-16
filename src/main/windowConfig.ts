import { join } from 'node:path'

export interface WindowConfigInput {
  platform: string
  appRoot: string
}

export function createWindowOptions({ platform, appRoot }: WindowConfigInput) {
  const mac = platform === 'darwin'
  return {
    width: 1402,
    height: 1122,
    minWidth: 960,
    minHeight: 720,
    ...(mac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } } : { frame: true }),
    backgroundColor: '#f5f4fb',
    webPreferences: {
      preload: join(appRoot, 'out/preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
}
