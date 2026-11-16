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
})
