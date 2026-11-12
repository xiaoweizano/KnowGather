import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const cdpEndpoint = process.env.SHIZHI_CDP_ENDPOINT ?? 'http://127.0.0.1:9333'
const appUrl = process.env.SHIZHI_APP_URL ?? 'http://127.0.0.1:4173/'
const outputDir = '.cache/acceptance'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const report = { generatedAt: new Date().toISOString(), viewports: [], overlays: [], persistence: null, input: null, errors: {} }
let baseline = null
let evaluate = async () => { throw new Error('CDP is not ready') }
let send = async () => { throw new Error('CDP is not ready') }

const targets = await fetch(`${cdpEndpoint}/json/list`).then((response) => response.json())
const target = targets.find((item) => item.type === 'page' && item.url.startsWith(appUrl))
assert(target?.webSocketDebuggerUrl, `No preview page found at ${appUrl} through ${cdpEndpoint}`)
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP WebSocket connect timeout')), 5000)
  socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
  socket.addEventListener('error', (event) => { clearTimeout(timer); reject(event.error ?? new Error('CDP WebSocket error')) }, { once: true })
})

let nextId = 0
const pending = new Map()
const runtimeErrors = []
const failedRequests = []
socket.addEventListener('message', async (event) => {
  const payload = typeof event.data === 'string' ? event.data : await event.data.text()
  const message = JSON.parse(payload)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id)
    pending.delete(message.id)
    clearTimeout(timer)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text)
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') runtimeErrors.push('console.error')
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    runtimeErrors.push(`${message.params.entry.text} ${message.params.entry.url ?? ''}`.trim())
  }
  if (message.method === 'Network.loadingFailed') {
    failedRequests.push(`${message.params.errorText} ${message.params.requestId ?? ''}`.trim())
  }
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
    failedRequests.push(`${message.params.response.status} ${message.params.response.url}`)
  }  if (message.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
})

send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)) }, 10000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  const { exceptionDetails, result } = response.result
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
  return result.value
}
async function waitFor(expression, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression).catch(() => false)) return
    await sleep(150)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function captureViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await sleep(250)
  const state = await evaluate(`(() => {
    const info = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return { exists: false }
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const parent = element.parentElement?.getBoundingClientRect()
      return {
        exists: true,
        width: rect.width,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
        parentWidth: parent?.width ?? null,
        parentHeight: parent?.height ?? null,
      }
    }
    const toolbar = document.querySelector('.editor-toolbar')
    const app = document.querySelector('#app')?.__vue_app__
    const provides = app?._context?.provides || {}
    const pinia = Object.getOwnPropertySymbols(provides).map((key) => provides[key])[0]
    const store = pinia?._s?.get?.('document')
    return {
      viewport: { width: innerWidth, height: innerHeight },
      elements: Object.fromEntries([
        '.document-shell', '.navigation-rail', '.resource-sidebar', '.editor-workspace',
        '.app-loading', '#app', '.editor-scroll', '.editor-paper', '.editor-toolbar', '.ProseMirror',
      ].map((selector) => [selector, info(selector)])),
      toolbarOverflow: toolbar ? toolbar.scrollWidth - toolbar.clientWidth : null,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      loading: store?.loading,
      currentId: store?.current?.id ?? null,
      editorInstanceId: store?.editorInstanceId ?? null,
    }
  })()`)
  const elements = state.elements
  for (const selector of ['.document-shell', '.navigation-rail', '.resource-sidebar', '.editor-workspace', '#app', '.editor-toolbar', '.ProseMirror']) {
    assert(elements[selector]?.exists, `${selector} is missing at ${width}x${height}`)
  }
  assert.equal(elements['.app-loading']?.exists, false, `.app-loading is still visible at ${width}x${height}`)
  for (const selector of ['.document-shell', '.editor-workspace', '#app', '.editor-toolbar', '.ProseMirror']) {
    assert(elements[selector].width > 0 && elements[selector].height > 0, `${selector} has zero size at ${width}x${height}`)
    assert.notEqual(elements[selector].display, 'none', `${selector} is display:none at ${width}x${height}`)
    assert.notEqual(elements[selector].visibility, 'hidden', `${selector} is hidden at ${width}x${height}`)
  }
  assert.equal(state.loading, false, 'documentStore.loading is true')
  assert(state.currentId, 'documentStore.current is empty')
  assert(state.editorInstanceId, 'Editor instance was not created')
  assert(state.toolbarOverflow <= 1, `toolbar overflow ${state.toolbarOverflow}px at ${width}x${height}`)
  assert(state.pageOverflow <= 1, `page horizontal overflow ${state.pageOverflow}px at ${width}x${height}`)
  const paperWidth = elements['.editor-paper'].width
  const proseWidth = elements['.ProseMirror'].width
  const scrollClientWidth = elements['.editor-scroll'].clientWidth
  assert(paperWidth <= scrollClientWidth + 1, `editor paper ${paperWidth}px exceeds scroll client ${scrollClientWidth}px at ${width}x${height}`)
  assert(proseWidth <= paperWidth + 1, `ProseMirror ${proseWidth}px exceeds editor paper ${paperWidth}px at ${width}x${height}`)
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  const screenshot = join(outputDir, `viewport-${width}x${height}.png`)
  await writeFile(screenshot, Buffer.from(shot.result.data, 'base64'))
  report.viewports.push({ requested: { width, height }, state, screenshot })
  return state
}

async function checkOverlays(label) {
  await evaluate(`(() => {
    const editor = document.querySelector('.ProseMirror')
    const paragraph = [...editor.querySelectorAll('p')].find((item) => item.textContent?.trim())
    if (!editor || !paragraph) return false
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    editor.focus()
    return true
  })()`)
  await waitFor(`!!document.querySelector('.bubble-menu')`, 'bubble menu')
  const bubble = await evaluate(`(() => {
    const rect = document.querySelector('.bubble-menu').getBoundingClientRect()
    const selection = getSelection().getRangeAt(0).getBoundingClientRect()
    return {
      viewport: { width: innerWidth, height: innerHeight },
      bubble: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      selection: { left: selection.left, top: selection.top, right: selection.right, bottom: selection.bottom },
    }
  })()`)
  const b = bubble.bubble
  assert(b.left >= 0 && b.top >= 0 && b.right <= bubble.viewport.width + 1 && b.bottom <= bubble.viewport.height + 1, `bubble is outside viewport at ${label}`)
  const overlap = !(b.bottom <= bubble.selection.top + 1 || b.top >= bubble.selection.bottom - 1 || b.right <= bubble.selection.left + 1 || b.left >= bubble.selection.right - 1)
  assert.equal(overlap, false, `bubble covers the selection at ${label}`)

  const focused = await evaluate(`(() => {
    const editor = document.querySelector('.ProseMirror')
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  })()`)
  assert(focused, 'cannot place caret for slash menu')
  await send('Input.insertText', { text: ' /' })
  await waitFor(`!!document.querySelector('.slash-menu')`, 'slash menu')
  const slash = await evaluate(`(() => {
    const rect = document.querySelector('.slash-menu').getBoundingClientRect()
    return { viewport: { width: innerWidth, height: innerHeight }, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } }
  })()`)
  assert(slash.rect.left >= 0 && slash.rect.top >= 0 && slash.rect.right <= slash.viewport.width + 1 && slash.rect.bottom <= slash.viewport.height + 1, `slash menu is outside viewport at ${label}`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await waitFor(`!document.querySelector('.slash-menu')`, 'slash menu close')
  const more = await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="更多格式"]')
    if (!button) return null
    button.click()
    return true
  })()`)
  assert(more, 'more-menu button is missing')
  await waitFor(`!!document.querySelector('.more-menu')`, 'more menu')
  const moreRect = await evaluate(`(() => {
    const rect = document.querySelector('.more-menu').getBoundingClientRect()
    return { viewport: { width: innerWidth, height: innerHeight }, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } }
  })()`)
  assert(moreRect.rect.left >= 0 && moreRect.rect.right <= moreRect.viewport.width + 1, `more menu is outside horizontal viewport at ${label}`)
  assert(moreRect.rect.top >= 0, `more menu top is outside viewport at ${label}`)
  await evaluate(`document.querySelector('button[aria-label="更多格式"]')?.click()`)
  report.overlays.push({ label, bubble, slash, more: moreRect })
}

async function settleEditor() {
  await evaluate(`(async () => {
    const app = document.querySelector('#app')?.__vue_app__
    const provides = app?._context?.provides || {}
    const pinia = Object.getOwnPropertySymbols(provides).map((key) => provides[key])[0]
    const store = pinia?._s?.get?.('document')
    await store?.saveNow?.()
  })()`).catch(() => {})
}
async function checkPersistenceAndInput() {
  await settleEditor()
  await evaluate(`(() => {
    localStorage.clear()
    for (const [key, value] of Object.entries(${JSON.stringify(baseline.storage)})) localStorage.setItem(key, value)
  })()`)
  await send('Page.reload', { ignoreCache: true })
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('.ProseMirror')`, 'editor after baseline reload')
  const before = await evaluate(`(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const provides = app?._context?.provides || {}
    const pinia = Object.getOwnPropertySymbols(provides).map((key) => provides[key])[0]
    const store = pinia?._s?.get?.('document')
    const editor = document.querySelector('.ProseMirror')
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    return { instanceId: store?.editorInstanceId, html: editor.innerHTML }
  })()`)
  const token = `持久化验收-${Date.now()}`
  await send('Input.insertText', { text: token })
  await waitFor(`localStorage.getItem('shizhi.documents.v1')?.includes(${JSON.stringify(token)})`, 'autosave persistence')
  await waitFor(`(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const provides = app?._context?.provides || {}
    const pinia = Object.getOwnPropertySymbols(provides).map((key) => provides[key])[0]
    return pinia?._s?.get?.('document')?.saveState?.phase === 'saved'
  })()`, 'saved state')
  const afterSave = await evaluate(`(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const provides = app?._context?.provides || {}
    const pinia = Object.getOwnPropertySymbols(provides).map((key) => provides[key])[0]
    const store = pinia?._s?.get?.('document')
    return { instanceId: store?.editorInstanceId, html: document.querySelector('.ProseMirror')?.innerHTML ?? '' }
  })()`)
  assert.equal(afterSave.instanceId, before.instanceId, 'editor instance changed after autosave')
  await send('Page.reload', { ignoreCache: true })
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('.ProseMirror')`, 'editor after persistence reload')
  assert(await evaluate(`document.querySelector('.ProseMirror')?.innerHTML.includes(${JSON.stringify(token)})`), 'persisted text did not survive reload')

  await evaluate(`(() => {
    window.__acceptanceInput = { compositionStart: 0, compositionEnd: 0 }
    const editor = document.querySelector('.ProseMirror')
    editor.addEventListener('compositionstart', () => window.__acceptanceInput.compositionStart += 1)
    editor.addEventListener('compositionend', () => window.__acceptanceInput.compositionEnd += 1)
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })()`)
  await send('Input.imeSetComposition', { text: '中', selectionStart: 1, selectionEnd: 1 })
  await send('Input.insertText', { text: '中文' })
  await sleep(250)
  const ime = await evaluate(`(() => ({
    events: window.__acceptanceInput,
    html: document.querySelector('.ProseMirror')?.innerHTML ?? '',
    slashOpen: !!document.querySelector('.slash-menu'),
  }))()`)
  assert(ime.events.compositionStart > 0 && ime.events.compositionEnd > 0, 'Chromium IME composition events were not observed')
  assert(ime.html.includes('中文'), 'IME committed text was not inserted')
  assert.equal(ime.slashOpen, false, 'slash menu opened during composition')

  const pasteText = `粘贴验收-${Date.now()}`
  const pasteResult = await evaluate(`(() => {
    const editor = document.querySelector('.ProseMirror')
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    const data = new DataTransfer()
    data.setData('text/html', '<p style="font-family:Comic Sans MS;color:red"><strong>${pasteText}</strong></p>')
    data.setData('text/plain', '${pasteText}')
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    return true
  })()`)
  await waitFor(`document.querySelector('.ProseMirror')?.innerHTML.includes(${JSON.stringify(pasteText)})`, 'sanitized clipboard paste')
  const pasteHtml = await evaluate(`document.querySelector('.ProseMirror')?.innerHTML ?? ''`)
  assert(pasteResult && pasteHtml.includes('<strong>'), 'clipboard semantic formatting was lost')
  assert(!pasteHtml.includes('Comic Sans MS') && !pasteHtml.includes('color:red'), 'clipboard inline styles were not sanitized')
  report.persistence = { token, beforeInstanceId: before.instanceId, afterSaveInstanceId: afterSave.instanceId, reloadVerified: true }
  report.input = { ime, pasteVerified: true }
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await sleep(250)
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('.ProseMirror')`, 'editor readiness')
  baseline = await evaluate(`(() => ({
    html: document.querySelector('.ProseMirror')?.innerHTML ?? '',
    storage: Object.fromEntries(Object.entries(localStorage)),
  }))()`)
  assert(baseline.html.length > 0, 'editor baseline is empty')

  for (const [width, height] of [[1402, 1122], [1280, 800], [960, 720]]) {
    await captureViewport(width, height)
    await checkOverlays(`${width}x${height}`)
  }
  await checkPersistenceAndInput()

  const relevantRuntimeErrors = runtimeErrors.filter((item) => !/favicon/i.test(item))
  const relevantFailures = failedRequests.filter((item) => !/favicon/i.test(item))
  assert.deepEqual(relevantRuntimeErrors, [], `runtime errors: ${relevantRuntimeErrors.join('; ')}`)
  assert.deepEqual(relevantFailures, [], `failed requests: ${relevantFailures.join('; ')}`)
  report.errors = {
    runtime: relevantRuntimeErrors,
    failedRequests: relevantFailures,
    ignoredFaviconErrors: runtimeErrors.filter((item) => /favicon/i.test(item)),
  }
  report.result = 'passed'
}

try {
  await main()
} catch (error) {
  report.result = 'failed'
  report.failure = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
} finally {
  try {
    if (baseline) {
      await settleEditor().catch(() => {})
      await evaluate(`(() => {
        localStorage.clear()
        for (const [key, value] of Object.entries(${JSON.stringify(baseline.storage)})) localStorage.setItem(key, value)
      })()`)
      await send('Page.reload', { ignoreCache: true })
      await waitFor(`document.readyState === 'complete' && !!document.querySelector('.ProseMirror')`, 'cleanup reload', 5000)
    }
  } catch (error) {
    report.cleanupError = error instanceof Error ? error.message : String(error)
  }
  await send('Emulation.clearDeviceMetricsOverride').catch(() => {})
  report.errors = {
    runtime: runtimeErrors,
    failedRequests: failedRequests.filter((item) => !/favicon/i.test(item)),
  }
  socket.close()
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  if (report.result !== 'passed') {
    console.error(report.failure ?? 'acceptance failed')
    process.exitCode = 1
  } else {
    console.log(`ACCEPTANCE OK: ${report.viewports.map((item) => `${item.requested.width}x${item.requested.height}`).join(', ')}; persistence/input/overlays passed`)
  }
}

