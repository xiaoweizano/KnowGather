import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

const endpoint = process.env.SHIZHI_CDP_ENDPOINT ?? 'http://127.0.0.1:9334'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json())
const target = targets.find((item) => item.type === 'page')
assert(target?.webSocketDebuggerUrl, 'no page target')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
const pending = new Map()
const errors = []
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
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push('console.error')
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)) }, 15000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  const { exceptionDetails, result } = response.result
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
  return result.value
}
const waitFor = async (expression, label, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression).catch(() => false)) return
    await sleep(150)
  }
  throw new Error(`timeout waiting for ${label}`)
}

await send('Runtime.enable')
await send('Page.reload', { ignoreCache: true })
await sleep(2500)
await waitFor(`!!document.querySelector('.journal-page')`, 'journal page rendered')
// A previous run may have left today's entry open: the startup behaviour opens
// it. Return to the list so the heatmap is on screen.
const openedOnStart = await evaluate(`!!document.querySelector('.journal-page.is-editing')`)
if (openedOnStart) {
  await evaluate(`document.querySelector('.journal-back').click()`)
}
await waitFor(`!!document.querySelector('.journal-heatmap .heatmap-cell')`, 'journal heatmap', 20000)

const shell = await evaluate(`(() => {
  const rail = [...document.querySelectorAll('.navigation-item')].map((item) => item.dataset.nav)
  return {
    active: document.querySelector('.navigation-item.active')?.dataset.nav ?? null,
    rail,
    hasHeatmap: !!document.querySelector('.journal-heatmap .heatmap-cell'),
    heatmapCells: document.querySelectorAll('.journal-heatmap .heatmap-cell').length,
    templateMenu: !!document.querySelector('.template-anchor .journal-create'),
  }
})()`)
assert.equal(shell.active, 'journal', `expected journal active, got ${shell.active}`)
assert.deepEqual(shell.rail, ['home', 'journal', 'library', 'assistant', 'settings'])
if (!shell.hasHeatmap) console.log(JSON.stringify(await evaluate("({ html: document.querySelector('.journal-page')?.innerHTML.slice(0,600), act: document.querySelector('.navigation-item.active')?.dataset.nav })"), null, 2));
assert.equal(shell.hasHeatmap, true)
assert(shell.heatmapCells > 300, `heatmap cells: ${shell.heatmapCells}`)

// Open the template menu and start a "daily review" entry.
await evaluate(`document.querySelector('.template-anchor .journal-create').click()`)
await waitFor(`!!document.querySelector('.template-menu')`, 'template menu')
const templateNames = await evaluate(`[...document.querySelectorAll('.template-menu button:not(.template-remove)')].map((b) => b.textContent.trim())`)
assert.equal(templateNames[0], '空白日志')
assert(templateNames.includes('每日回顾'), `templates: ${templateNames.join(' | ')}`)
await evaluate(`[...document.querySelectorAll('.template-menu button:not(.template-remove)')].find((b) => b.textContent.includes('每日回顾')).click()`)
// The editor pane re-mounts asynchronously after the journal record is written.
await sleep(1500)
await waitFor(`!!document.querySelector('.journal-page.is-editing')`, 'journal editor from template')
await waitFor(`!!document.querySelector('.journal-page .shizhi-editor')`, 'template content in the editor', 20000)
const templated = await evaluate(`document.querySelector('.shizhi-editor').innerText`)
assert(templated.includes('今天做了什么'), `template content: ${templated}`)

// Write into the entry and wait for the autosave to settle.
await evaluate(`(() => {
  const editor = document.querySelector('.shizhi-editor')
  editor.focus()
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  const selection = getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  return true
})()`)
await send('Input.insertText', { text: '模板验收内容' })
await waitFor(`(() => {
  const app = document.querySelector('#app').__vue_app__
  const provides = app._context.provides
  const pinia = Object.getOwnPropertySymbols(provides).map((k) => provides[k])[0]
  return pinia._s.get('document').journalSaveState.phase === 'saved'
})()`, 'journal autosave')

// Promote to the library.
await evaluate(`document.querySelector('.journal-promote').click()`)
await waitFor(`!!document.querySelector('.promote-dialog')`, 'promote dialog')
await evaluate(`(() => {
  const input = document.querySelector('.promote-dialog input')
  input.value = '验收沉淀文档'
  input.dispatchEvent(new Event('input'))
  return true
})()`)
await evaluate(`document.querySelector('.promote-dialog .promote-primary').click()`)
await waitFor(`(() => {
  const app = document.querySelector('#app').__vue_app__
  const provides = app._context.provides
  const pinia = Object.getOwnPropertySymbols(provides).map((k) => provides[k])[0]
  const store = pinia._s.get('document')
  return store.currentJournal?.documentId && store.documents.some((d) => d.title === '验收沉淀文档')
})()`, 'promotion to library')
await waitFor(`!!document.querySelector('.journal-sync-state')`, 'synced chip')

// Jump to the synced document and check the source chip.
await evaluate(`document.querySelector('.journal-sync-state').click()`)
await waitFor(`!!document.querySelector('.document-header .source-chip')`, 'document source chip')
const docView = await evaluate(`({
  title: document.querySelector('.document-title')?.value,
  chip: document.querySelector('.source-chip')?.textContent.trim(),
  active: document.querySelector('.navigation-item.active')?.dataset.nav,
  sidebarEntries: [...document.querySelectorAll('.recent-item')].map((item) => item.dataset.entryKind),
  body: document.querySelector('.shizhi-editor')?.innerText ?? '',
})`)
assert.equal(docView.title, '验收沉淀文档')
assert.equal(docView.chip, '来自日志')
assert.equal(docView.active, 'library')
assert(docView.sidebarEntries.every((kind) => kind === 'document'), `sidebar kinds: ${docView.sidebarEntries}`)
assert(docView.body.includes('模板验收内容'))

// Back to the journal, then click a heatmap cell with no entry.
await evaluate(`[...document.querySelectorAll('.navigation-item')].find((item) => item.dataset.nav === 'journal').click()`)
await waitFor(`!!document.querySelector('.journal-heatmap')`, 'journal heatmap')

// Back-to-list must not lose a title edited just before leaving.
const preserved = await evaluate(`(async () => {
  const cards = [...document.querySelectorAll('.journal-card')]
  const target = cards.find((card) => card.querySelector('strong')?.textContent.includes('验收沉淀文档'))
  if (!target) return { ok: false, reason: 'no entry to reopen' }
  target.querySelector('.journal-open').click()
  const deadline = Date.now() + 8000
  while (Date.now() < deadline && !document.querySelector('.journal-page.is-editing')) {
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  const input = document.querySelector('.journal-title')
  input.value = '离开前改的标题'
  input.dispatchEvent(new Event('input'))
  document.querySelector('.journal-back').click()
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const titles = [...document.querySelectorAll('.journal-card strong')].map((el) => el.textContent)
  return { ok: titles.includes('离开前改的标题'), titles }
})()`)
assert.equal(preserved.ok, true, `title lost on back: ${JSON.stringify(preserved)}`)

const created = await evaluate(`(async () => {
  const before = [...document.querySelectorAll('.journal-card strong')].map((el) => el.textContent)
  const cells = [...document.querySelectorAll('.journal-heatmap button.heatmap-cell')]
  const empty = cells.find((cell) => cell.classList.contains('level-0') && !cell.disabled)
  if (!empty) return { ok: false, reason: 'no empty cell' }
  const label = empty.getAttribute('aria-label')
  empty.click()
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (document.querySelector('.journal-page.is-editing')) break
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  const title = document.querySelector('.journal-title')?.value ?? ''
  return { ok: !!document.querySelector('.journal-page.is-editing'), title, label, before }
})()`)
assert.equal(created.ok, true, `heatmap click: ${JSON.stringify(created)}`)
assert.match(created.title, /日志$/)

// Persisted entries: reload and confirm both the promoted doc and the day entry survive.
const journalCount = await evaluate(`(() => {
  const app = document.querySelector('#app').__vue_app__
  const provides = app._context.provides
  const pinia = Object.getOwnPropertySymbols(provides).map((k) => provides[k])[0]
  const store = pinia._s.get('document')
  return { journals: store.journals.length, documents: store.documents.length }
})()`)

const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
await writeFile('.cache/acceptance/journal-first.png', Buffer.from(shot.result.data, 'base64')).catch(() => undefined)

console.log(JSON.stringify({ shell, templateNames, journalCount, created, docView, errors }, null, 2))
assert.equal(errors.length, 0, `runtime errors: ${errors.join('; ')}`)
console.log('JOURNAL-FIRST ACCEPTANCE OK')
socket.close()
