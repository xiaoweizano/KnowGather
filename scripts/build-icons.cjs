/**
 * Builds the app icons from the master artwork.
 *
 * `docs/萌趣知识猫咪书屋.png` is the designed mark: mascot, book, orbit and the
 * four content cards. At a glance it is exactly right; at 16px the cards and
 * orbit collapse into speckles and no crop can save them — there is simply not
 * enough resolution for four rounded cards plus a mascot.
 *
 * So the icon set is deliberately mixed:
 *
 *   - 32px and up: the artwork, resampled. This is the version people see in
 *     Explorer, the taskbar, the Start menu tile and the installer.
 *   - 16/24px: a hand-drawn vector that keeps only the silhouette the bitmap
 *     cannot — big face, two eyes, book, sprout. Drawn at that size, not
 *     shrunk to it.
 *
 * Run with Electron (it is the only image renderer in the toolchain):
 *
 *   node_modules/electron/dist/electron.exe scripts/build-icons.cjs
 *
 * Writes `build/icon.png` (512), `build/icon.ico` (7 frames) and a preview page.
 */
const { app, BrowserWindow } = require('electron')
const { mkdir, readFile, writeFile } = require('node:fs/promises')
const path = require('node:path')

const SOURCE = path.join(__dirname, '..', 'docs', '萌趣知识猫咪书屋.png')
const OUT_DIR = path.join(__dirname, '..', 'build')

/** Sizes shipped in the .ico; Windows picks the nearest one per context. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
/** Below this the bitmap is replaced by the vector silhouette. */
const VECTOR_BELOW = 32

/**
 * The tiny-size mark.
 *
 * Proportions are exaggerated on purpose: the head fills most of the tile and
 * the book sits under it as a wide arc, because at 16px those two masses are
 * the only shapes that survive. `s` scales the whole drawing so 16 and 24 come
 * from one definition.
 */
function tinyMark(size) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
    <defs>
      <linearGradient id="tBg" x1="0.1" y1="0" x2="0.7" y2="1">
        <stop offset="0" stop-color="#43CBFF"/>
        <stop offset="0.45" stop-color="#1E6FE0"/>
        <stop offset="1" stop-color="#0A1568"/>
      </linearGradient>
      <linearGradient id="tBook" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7FD8FF"/>
        <stop offset="1" stop-color="#1A54C0"/>
      </linearGradient>
      <radialGradient id="tLight" cx="0.34" cy="0.26" r="0.7">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="tShade" cx="0.8" cy="0.9" r="0.7">
        <stop offset="0" stop-color="#7D6FD0" stop-opacity="0.4"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tLeaf" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#22A85C"/>
        <stop offset="1" stop-color="#A6F5BA"/>
      </linearGradient>
    </defs>

    <rect width="64" height="64" rx="15" fill="url(#tBg)"/>
    <ellipse cx="32" cy="62" rx="30" ry="12" fill="#A9F2FF" opacity="0.28"/>

    <!-- Book: a wide arc under the mascot -->
    <path d="M32 48C25 44 13 45 2 51l-1 9c13-6 24-6 31-2Z" fill="url(#tBook)"/>
    <path d="M32 48c7-4 19-3 30 3l1 9c-13-6-24-6-31-2Z" fill="url(#tBook)"/>
    <path d="M32 48v12" stroke="#0C2F7A" stroke-width="2"/>

    <!-- Ears -->
    <path d="M17 27c-2-5-1-9 2-11 2 3 4 5 7 6Z" fill="#FFFDFB"/>
    <path d="M47 27c2-5 1-9-2-11-2 3-4 5-7 6Z" fill="#FFFDFB"/>

    <!-- Head -->
    <ellipse cx="32" cy="34" rx="17" ry="15" fill="#FFFDFB"/>
    <ellipse cx="32" cy="34" rx="17" ry="15" fill="url(#tLight)"/>
    <ellipse cx="32" cy="34" rx="17" ry="15" fill="url(#tShade)"/>

    <!-- Sprout -->
    <path d="M32 19v-5" stroke="#1FA65A" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M31.6 15c-1.6-3-4.4-4.6-7.6-4.2.4 3.4 3 5.8 6.4 6.2Z" fill="url(#tLeaf)"/>
    <path d="M32.4 15c1.6-3.4 4.4-5 7.6-4.6-.4 3.4-3 5.8-6.4 6.2Z" fill="url(#tLeaf)"/>

    <!-- Face: the eyes carry the recognition at 16px, so they are oversized -->
    <ellipse cx="25" cy="34" rx="3.6" ry="4.4" fill="#3A3152"/>
    <circle cx="23.9" cy="32.3" r="1.5" fill="#FFFFFF"/>
    <path d="M37 31.6l4 2.6-4 2.6" fill="none" stroke="#3A3152" stroke-width="2.3"
          stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="32" cy="41" rx="2.6" ry="2.9" fill="#6E2F49"/>
    <ellipse cx="32" cy="42" rx="1.7" ry="1.7" fill="#FF8FB0"/>
  </svg>`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const window = new BrowserWindow({
    show: false,
    width: 600,
    height: 600,
    webPreferences: { offscreen: true, deviceScaleFactor: 1 },
  })

  const sourceUrl = 'data:image/png;base64,' + (await readFile(SOURCE)).toString('base64')

  const frames = {}
  for (const size of ICO_SIZES) {
    frames[size] = size < VECTOR_BELOW
      ? await renderSvg(window, tinyMark(size), size)
      : await renderFrame(window, sourceUrl, size, { crop: 1, zoom: 1, focus: 0 })
  }
  // 512 is for store listings and the about screen; `icon.png` below already
  // carries the 256 frame, so that size is not written twice.
  {
    const png = await renderFrame(window, sourceUrl, 512, { crop: 1, zoom: 1, focus: 0 })
    await writeFile(path.join(OUT_DIR, 'icon-512.png'), Buffer.from(png.split(',')[1], 'base64'))
  }
  await writeFile(path.join(OUT_DIR, 'icon.png'), Buffer.from(frames[256].split(',')[1], 'base64'))
  await writeFile(path.join(OUT_DIR, 'icon.ico'), buildIco(frames))

  // Tray art: the 16px frame scaled from the vector. The taskbar shows it at
  // ~16 logical px against an arbitrary background, so the full artwork (which
  // is what the .ico's 32px frame holds) reads as a blob there.
  for (const size of [16, 32]) {
    const png = await renderSvg(window, tinyMark(size), size)
    await writeFile(path.join(OUT_DIR, `tray-${size}.png`), Buffer.from(png.split(',')[1], 'base64'))
  }

  await writeContactSheet(window, frames)
  window.destroy()
  app.quit()
}

/** Rasterises one of the hand-drawn SVGs at an exact pixel size. */
async function renderSvg(window, svg, size) {
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <div id="target">${svg}</div></body></html>`
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  const script = [
    '(async () => {',
    '  const svg = document.querySelector("#target svg")',
    '  const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" })',
    '  const url = URL.createObjectURL(blob)',
    '  const image = new Image()',
    '  await new Promise((resolve, reject) => {',
    '    image.onload = resolve',
    '    image.onerror = reject',
    '    image.src = url',
    '  })',
    '  const canvas = document.createElement("canvas")',
    '  canvas.width = ' + size,
    '  canvas.height = ' + size,
    '  const ctx = canvas.getContext("2d")',
    '  ctx.imageSmoothingQuality = "high"',
    '  ctx.drawImage(image, 0, 0, ' + size + ', ' + size + ')',
    '  URL.revokeObjectURL(url)',
    '  return canvas.toDataURL("image/png")',
    '})()',
  ].join('\n')
  return window.webContents.executeJavaScript(script)
}

/**
 * Draws one square frame.
 *
 * The source is 1254px with the rounded tile already baked in, so a plain
 * `drawImage` of the crop would clip the rounded corners off-centre. Instead the
 * crop is drawn to a canvas pre-clipped to the same rounded rect, at the same
 * radius as the artwork (58/256 ≈ 22.7%), so corners stay round at every size.
 */
async function renderFrame(window, sourceUrl, size, recipe) {
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <canvas id="c" width="${size}" height="${size}" data-source="${sourceUrl}"
            data-size="${size}" data-crop="${recipe.crop}" data-zoom="${recipe.zoom}"
            data-focus="${recipe.focus}"></canvas>
  </body></html>`
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // A plain string, not a template: this source is itself stringified into the
  // page, and nested backticks inside a template literal break the parse.
  const script = [
    '(async () => {',
    '  const canvas = document.querySelector("#c")',
    '  const source = new Image()',
    '  await new Promise((resolve, reject) => {',
    '    source.onload = resolve',
    '    source.onerror = reject',
    '    source.src = canvas.dataset.source',
    '  })',
    '  const size = Number(canvas.dataset.size)',
    '  const crop = Number(canvas.dataset.crop)',
    '  const zoom = Number(canvas.dataset.zoom)',
    '  const focus = Number(canvas.dataset.focus)',
    '  const ctx = canvas.getContext("2d")',
    '  ctx.imageSmoothingQuality = "high"',
    '  ctx.save()',
    '  ctx.beginPath()',
    '  ctx.roundRect(0, 0, size, size, size * (58 / 256))',
    '  ctx.clip()',
    '  const side = source.width * crop',
    '  const sx = (source.width - side) / 2',
    '  const sy = (source.height - side) / 2',
    '  const box = size * zoom',
    '  const offset = (size - box) / 2',
    '  ctx.drawImage(source, sx, sy, side, side, offset, offset, box, box)',
    '  if (focus > 0) {',
    '    // Vignette: darken everything outside the mascot ellipse with the same',
    '    // deep violet the artwork uses, so the cards fade out instead of',
    '    // turning into speckles at 16px.',
    '    const gradient = ctx.createRadialGradient(',
    '      size / 2, size * 0.52, size * focus * 0.52,',
    '      size / 2, size * 0.52, size * 0.78)',
    '    gradient.addColorStop(0, "rgba(20, 18, 74, 0)")',
    '    gradient.addColorStop(0.62, "rgba(20, 18, 74, 0.35)")',
    '    gradient.addColorStop(1, "rgba(14, 12, 58, 0.92)")',
    '    ctx.fillStyle = gradient',
    '    ctx.fillRect(0, 0, size, size)',
    '  }',
    '  ctx.restore()',
    '  return canvas.toDataURL("image/png")',
    '})()',
  ].join('\n')
  return window.webContents.executeJavaScript(script)
}

/**
 * Packs PNG frames into an .ico.
 *
 * Windows Vista and later accept PNG-compressed frames directly, so no BMP
 * conversion is needed. Directory entries must be sorted by size for some
 * consumers; the IHDR width/height bytes are what Explorer reads.
 */
function buildIco(frames) {
  const sizes = Object.keys(frames).map(Number).sort((a, b) => a - b)
  const images = sizes.map((size) => ({
    size,
    data: Buffer.from(frames[size].split(',')[1], 'base64'),
  }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const directory = Buffer.alloc(images.length * 16)
  images.forEach((image, index) => {
    const at = index * 16
    // 256 is encoded as 0 in a single byte.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, at + 0)
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, at + 1)
    directory.writeUInt8(0, at + 2) // palette
    directory.writeUInt8(0, at + 3) // reserved
    directory.writeUInt16LE(1, at + 4) // colour planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(image.data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += image.data.length
  })
  return Buffer.concat([header, directory, ...images.map((image) => image.data)])
}

async function writeContactSheet(window, frames) {
  await mkdir(path.join(OUT_DIR, "icon-preview"), { recursive: true })
  const cells = [256, 128, 48, 32, 24, 16].map((size) => `
    <figure>
      <img src="${frames[size]}" width="${size}" height="${size}" alt="${size}px">
      <figcaption>${size}px</figcaption>
    </figure>`).join('')
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>拾知 · 图标</title>
<style>
  body { margin:0; padding:32px; background:#f5f4f8; color:#1d1b2b;
         font:14px/1.6 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; }
  h1 { margin:0 0 6px; font-size:22px; }
  p.lead { margin:0 0 26px; color:#6a6680; }
  .panel { padding:24px; border:1px solid #e6e3f0; border-radius:16px; background:#fff; margin-bottom:20px; }
  .row { display:flex; flex-wrap:wrap; align-items:flex-end; gap:26px; }
  .dark { background:#1f1d2b; }
  .dark figcaption { color:#b9b3cf; }
  figure { margin:0; text-align:center; }
  figcaption { margin-top:8px; color:#8b86a3; font-size:11px; }
  img { display:block; }
</style></head>
<body>
  <h1>拾知 · 应用图标</h1>
  <p class="lead">由 docs/萌趣知识猫咪书屋.png 生成。大尺寸保留完整构图，小尺寸裁切到萌宠，保证任务栏仍可辨认。</p>
  <div class="panel"><div class="row">${cells}</div></div>
  <div class="panel dark"><div class="row">${cells}</div></div>
</body></html>`
  await writeFile(path.join(OUT_DIR, 'icon-preview', 'preview.html'), html, 'utf8')
}

app.whenReady().then(main).catch((error) => {
  console.error(error)
  app.quit()
  process.exitCode = 1
})
