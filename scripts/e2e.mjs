import assert from 'node:assert/strict'

const cdpEndpoint = process.env.SHIZHI_CDP_ENDPOINT ?? 'http://127.0.0.1:9333'
const appUrl = process.env.SHIZHI_APP_URL ?? 'http://127.0.0.1:4173/'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params.exceptionDetails.text)
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    runtimeErrors.push('console.error')
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    runtimeErrors.push(message.params.entry.text)
  }
  if (message.method === 'Network.loadingFailed') {
    failedRequests.push(message.params.errorText)
  }
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)) }, 10000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  const { exceptionDetails, result } = response.result
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
  }
  return result.value
}

async function waitFor(expression, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression).catch(() => false)) return
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

let baseline = null
try {
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('.ProseMirror')`, 'editor')

  baseline = await evaluate(`(() => ({
    html: document.querySelector('.ProseMirror')?.innerHTML ?? '',
    storage: Object.fromEntries(Object.entries(localStorage)),
  }))()`)
  assert(baseline.html.length > 0, 'Editor baseline is empty')

  const state = await evaluate(`(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { width: box.width, height: box.height }
    }
    const app = document.querySelector('#app')?.__vue_app__
    const provides = app?._context?.provides || {}
    const pinia = Object.getOwnPropertySymbols(provides).map((key) => provides[key])[0]
    const store = pinia?._s?.get?.('document')
    const toolbar = document.querySelector('.editor-toolbar')
    return {
      workspace: rect('.editor-workspace'),
      editor: rect('.ProseMirror'),
      toolbar: rect('.editor-toolbar'),
      toolbarOverflow: toolbar ? toolbar.scrollWidth - toolbar.clientWidth : null,
      loading: store?.loading,
      currentId: store?.current?.id ?? null,
      editorInstanceId: store?.editorInstanceId ?? null,
    }
  })()`)
  assert(state.workspace?.width > 0 && state.workspace?.height > 0, 'Editor workspace has zero size')
  assert(state.editor?.width > 0 && state.editor?.height > 0, 'ProseMirror has zero size')
  assert(state.toolbar?.width > 0 && state.toolbar?.height > 0, 'Toolbar has zero size')
  assert(state.toolbarOverflow <= 1, `Toolbar overflows horizontally by ${state.toolbarOverflow}px`)
  assert.equal(state.loading, false, 'documentStore.loading is true')
  assert(state.currentId, 'documentStore.current is empty')
  assert(state.editorInstanceId, 'Editor instance was not created')

  const moreOpened = await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="更多格式"]')
    if (!button) return false
    button.click()
    return true
  })()`)
  assert(moreOpened, 'More-format button is missing')
  await waitFor(`!!document.querySelector('.more-menu')`, 'more menu')
  assert(await evaluate(`document.querySelectorAll('.more-menu [role="menuitem"]').length > 0`), 'More menu is empty')
  await evaluate(`document.querySelector('button[aria-label="更多格式"]')?.click()`)

  await evaluate(`(() => {
    const editor = document.querySelector('.ProseMirror')
    const range = document.createRange()
    range.selectNodeContents(editor)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    editor.focus()
    return true
  })()`)
  await waitFor(`!!document.querySelector('.bubble-menu')`, 'bubble menu')
  const boldClicked = await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="粗体"]')
    if (!button) return false
    button.click()
    return true
  })()`)
  assert(boldClicked, 'Bold toolbar button is missing')
  await sleep(100)
  assert.notEqual(await evaluate(`document.querySelector('.ProseMirror')?.innerHTML`), baseline.html, 'Bold command did not change content')
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.title?.startsWith('撤销'))
    if (!button) return false
    button.click()
    return true
  })()`)
  await waitFor(`document.querySelector('.ProseMirror')?.innerHTML === ${JSON.stringify(baseline.html)}`, 'bold undo')

  await evaluate(`(() => {
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
  await send('Input.insertText', { text: ' /' })
  await waitFor(`!!document.querySelector('.slash-menu')`, 'slash menu')
  assert(await evaluate(`document.querySelectorAll('.slash-menu [role="option"]').length > 0`), 'Slash menu has no options')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await waitFor(`!document.querySelector('.slash-menu')`, 'slash menu close')
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.title?.startsWith('撤销'))
    if (!button) return false
    button.click()
    return true
  })()`)
  await waitFor(`document.querySelector('.ProseMirror')?.innerHTML === ${JSON.stringify(baseline.html)}`, 'slash undo')

  await evaluate(`(() => {
    localStorage.clear()
    for (const [key, value] of Object.entries(${JSON.stringify(baseline.storage)})) localStorage.setItem(key, value)
    return true
  })()`)
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.entries(localStorage))`), baseline.storage, 'localStorage was not restored')
  assert.deepEqual(runtimeErrors, [], `Runtime errors: ${runtimeErrors.join('; ')}`)
  const relevantFailures = failedRequests.filter((item) => !/favicon/i.test(item))
  assert.deepEqual(relevantFailures, [], `Failed requests: ${relevantFailures.join('; ')}`)

  console.log(`E2E OK: workspace ${state.workspace.width}x${state.workspace.height}, toolbar overflow ${state.toolbarOverflow}px, bubble/slash/toolbar flows passed`)
} finally {
  if (baseline) {
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (await evaluate(`document.querySelector('.ProseMirror')?.innerHTML`) === baseline.html) break
        await evaluate(`(() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.title?.startsWith('撤销'))
          if (!button || button.disabled) return false
          button.click()
          return true
        })()`)
        await sleep(120)
      }
      await sleep(1100)
      await evaluate(`(() => {
        localStorage.clear()
        for (const [key, value] of Object.entries(${JSON.stringify(baseline.storage)})) localStorage.setItem(key, value)
        return true
      })()`)
    } catch {
      // Keep the original E2E failure as the primary error.
    }
  }
  socket.close()
}
