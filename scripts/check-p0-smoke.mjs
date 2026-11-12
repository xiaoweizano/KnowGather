import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { compileScript, parse } from 'vue/compiler-sfc'

const root = fileURLToPath(new URL('..', import.meta.url))
const editorPath = join(root, 'src/renderer/src/components/EditorWorkspace.vue')
const rendererAssets = join(root, 'out/renderer/assets')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function checkCompiledComponent() {
  const source = await readFile(editorPath, 'utf8')
  const { descriptor, errors } = parse(source, { filename: editorPath })
  assert.equal(errors.length, 0, `EditorWorkspace.vue parse failed: ${errors.join('; ')}`)
  const compiled = compileScript(descriptor, { id: 'p0-smoke', inlineTemplate: true })
  const output = ts.transpileModule(compiled.content, {
    fileName: editorPath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      sourceMap: false,
      verbatimModuleSyntax: false,
    },
  }).outputText
  assert.match(output, /__name:\s*['"]EditorWorkspace['"]/)
  assert.match(output, /document:\s*\{\s*type:\s*Object,\s*required:\s*true\s*\}/)
}

async function checkBuiltArtifacts() {
  const files = await readdir(rendererAssets)
  const jsFiles = files.filter((file) => file.endsWith('.js') && !file.endsWith('.map'))
  const cssFiles = files.filter((file) => file.endsWith('.css'))
  assert(jsFiles.length > 0, 'No renderer JavaScript bundle found')
  assert(cssFiles.length > 0, 'No renderer CSS bundle found')
  const js = (await Promise.all(jsFiles.map((file) => readFile(join(rendererAssets, file), 'utf8')))).join('\n')
  const css = (await Promise.all(cssFiles.map((file) => readFile(join(rendererAssets, file), 'utf8')))).join('\n')
  assert.match(js, /__name:\s*['"]EditorWorkspace['"]/)
  assert.match(js, /document:\s*\{\s*type:\s*Object,\s*required:\s*true\s*\}/)
  assert.doesNotMatch(js, /resolveComponent\(['"]EditorWorkspace['"]\)/)
  assert.match(css, /\.editor-workspace/)
}
async function checkRuntimeDom() {
  const targets = await fetch('http://127.0.0.1:9333/json/list').then((response) => response.json())
  const target = targets.find((item) => item.type === 'page' && item.url.includes('127.0.0.1:4173'))
  assert(target?.webSocketDebuggerUrl, 'No preview page found on CDP port 9333')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP WebSocket connect timeout')), 5000)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', (event) => { clearTimeout(timer); reject(event.error ?? new Error('CDP WebSocket error')) }, { once: true })
  })

  let nextId = 0
  const pending = new Map()
  const runtimeErrors = []
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
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') runtimeErrors.push(message.params.entry.text)
    if (message.method === 'Network.loadingFailed') runtimeErrors.push(`resource: ${message.params.errorText}`)
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)) }, 10000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })

  try {
    await send('Runtime.enable')
    await send('Log.enable')
    await send('Network.enable')
    await send('Page.enable')
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' })
    await sleep(5000)
    const response = await send('Runtime.evaluate', {
      expression: `(() => {
        const info = (selector) => {
          const element = document.querySelector(selector)
          if (!element) return { exists: false }
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { exists: true, width: rect.width, height: rect.height, display: style.display, visibility: style.visibility }
        }
        const app = document.querySelector('#app')?.__vue_app__
        const provides = app?._context?.provides || {}
        const pinia = Object.getOwnPropertySymbols(provides).map((key) => provides[key])[0]
        const store = pinia?._s?.get?.('document')
        return {
          workspace: info('.editor-workspace'),
          editor: info('.ProseMirror'),
          loading: store?.loading,
          currentId: store?.current?.id ?? null,
          editorInstanceId: store?.editorInstanceId ?? null,
        }
      })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    const value = response.result.result.value
    assert.equal(value.workspace.exists, true, 'Missing .editor-workspace')
    assert(value.workspace.width > 0 && value.workspace.height > 0, '.editor-workspace has zero size')
    assert.equal(value.workspace.display, 'flex', '.editor-workspace is not flex')
    assert.equal(value.workspace.visibility, 'visible', '.editor-workspace is not visible')
    assert.equal(value.editor.exists, true, 'Missing .ProseMirror')
    assert(value.editor.width > 0 && value.editor.height > 0, '.ProseMirror has zero size')
    assert.equal(value.editor.visibility, 'visible', '.ProseMirror is not visible')
    assert.equal(value.loading, false, 'documentStore.loading is still true')
    assert(value.currentId, 'documentStore.current is empty')
    assert(value.editorInstanceId, 'Editor instance was not created')
    assert.deepEqual(runtimeErrors, [], `Runtime errors: ${runtimeErrors.join('; ')}`)
    return value
  } finally {
    socket.close()
  }
}

export async function checkP0Smoke({ runtime = false } = {}) {
  await checkCompiledComponent()
  await checkBuiltArtifacts()
  console.log('P0 smoke: compiled runtime props and build artifacts OK')
  if (runtime) {
    const state = await checkRuntimeDom()
    console.log(`P0 smoke: runtime DOM OK (${state.workspace.width}x${state.workspace.height}, editor ${state.editorInstanceId})`)
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  checkP0Smoke({ runtime: process.argv.includes('--runtime') }).catch((error) => {
    console.error(`P0 smoke failed: ${error.stack ?? error}`)
    process.exitCode = 1
  })
}