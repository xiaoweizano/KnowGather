import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The tray icon depends on pulling a PNG frame out of the .ico by hand:
 * `nativeImage.createFromPath` returns an empty image for an .ico inside
 * `app.asar`, which is what silently fell back to the drawn placeholder.
 */

function readIcoFrame(ico: Buffer, wanted: number): Buffer | null {
  if (ico.length < 6 || ico.readUInt16LE(2) !== 1) return null
  const count = ico.readUInt16LE(4)
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 16
    const width = ico[at] === 0 ? 256 : ico[at]!
    const size = ico.readUInt32LE(at + 8)
    const offset = ico.readUInt32LE(at + 12)
    if (width !== wanted || offset + size > ico.length) continue
    return ico.subarray(offset, offset + size)
  }
  return null
}

describe('packaged icon asset', () => {
  const ico = readFileSync('build/icon.ico')

  it('declares every frame a Windows shell may ask for', () => {
    expect(ico.readUInt16LE(2)).toBe(1)
    const count = ico.readUInt16LE(4)
    const widths: number[] = []
    for (let index = 0; index < count; index += 1) {
      const at = 6 + index * 16
      widths.push(ico[at] === 0 ? 256 : ico[at]!)
    }
    expect(widths).toEqual([16, 24, 32, 48, 64, 128, 256])
  })

  it('stores frames as PNG so they can be handed to createFromBuffer', () => {
    for (const width of [16, 32, 256]) {
      const frame = readIcoFrame(ico, width)
      expect(frame, `${width}px frame`).not.toBeNull()
      // PNG signature, not a BITMAPINFOHEADER.
      expect([...frame!.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
      // IHDR width must match the directory entry.
      expect(frame!.readUInt32BE(16)).toBe(width)
    }
  })

  it('keeps a 32px frame for the tray, which halves cleanly at any DPI', () => {
    const frame = readIcoFrame(ico, 32)
    expect(frame).not.toBeNull()
    const png = readFileSync('build/icon.png')
    // The standalone PNG is the 256 frame; both must be real images.
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
})
