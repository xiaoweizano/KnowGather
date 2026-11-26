import { describe, expect, it } from 'vitest'
import { createWindowOptions } from '../src/main/windowConfig'

describe('createWindowOptions', () => {
  it('uses the native Windows title bar without macOS traffic lights', () => {
    const options = createWindowOptions({ platform: 'win32', appRoot: 'C:/app' })

    expect(options.frame).toBe(true)
    expect(options.titleBarStyle).toBeUndefined()
    expect(options.trafficLightPosition).toBeUndefined()
    expect(options.webPreferences?.preload).toBe('C:\\app\\out\\preload\\index.cjs')
  })

  it('enables the inset macOS title bar only on macOS', () => {
    const options = createWindowOptions({ platform: 'darwin', appRoot: '/Applications/Shizhi.app/Contents/Resources/app.asar' })

    expect(options.titleBarStyle).toBe('hiddenInset')
    expect(options.trafficLightPosition).toEqual({ x: 16, y: 16 })
  })

  it('keeps preload isolation enabled in production options', () => {
    const options = createWindowOptions({ platform: 'win32', appRoot: 'C:/app' })

    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
  })

  it('uses the packaged icon on Windows and skips it on macOS', () => {
    const iconPath = 'C:/app/build/icon.ico'
    expect(createWindowOptions({ platform: 'win32', appRoot: 'C:/app', iconPath }).icon).toBe(iconPath)
    // macOS takes the window icon from the bundle; passing one has no effect.
    expect(createWindowOptions({ platform: 'darwin', appRoot: '/app', iconPath }).icon).toBeUndefined()
  })

  it('leaves the icon unset when no asset was found', () => {
    expect(createWindowOptions({ platform: 'win32', appRoot: 'C:/app' }).icon).toBeUndefined()
  })
})
