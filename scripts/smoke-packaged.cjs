// End-to-end smoke against the packaged build driven over CDP.
const endpoint = 'http://127.0.0.1:9444'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function connect() {
  const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json())
  const target = targets.find((item) => item.type === 'page')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let id = 0
  const pending = new Map()
  const errors = []
  socket.addEventListener('message', async (event) => {
    const raw = typeof event.data === 'string' ? event.data : await event.data.text()
    const message = JSON.parse(raw)
    if (message.id && pending.has(message.id)) {
      const { resolve } = pending.get(message.id)
      pending.delete(message.id)
      resolve(message.result ?? null)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((argument) => argument.value ?? argument.description).join(' '))
    }
  })

  const send = (method, params = {}) => new Promise((resolve) => {
    const messageId = ++id
    pending.set(messageId, { resolve })
    socket.send(JSON.stringify({ id: messageId, method, params }))
  })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (!result) return null
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval failed')
    return result.result.value
  }

  await send('Runtime.enable')
  await send('Page.enable')
  return { send, evaluate, errors, close: () => socket.close() }
}

async function main() {
  let session = await connect()
  const results = {}

  results.seededDocument = await session.evaluate(`(async () => {
    const list = await window.shizhi.documents.list();
    return JSON.stringify({ count: list.length, titles: list.map((d) => d.title) });
  })()`)

  // Reload so the renderer's store picks up the document written over IPC.
  await session.send('Page.reload', { ignoreCache: true })
  await sleep(3500)

  results.editor = await session.evaluate(`(async () => {
    document.querySelector('[data-nav=library]').click();
    await new Promise((r) => setTimeout(r, 1600));
    return JSON.stringify({
      title: document.querySelector('.document-title')?.value,
      hasOutline: Boolean(document.querySelector('.outline-panel')),
      hasToolbar: Boolean(document.querySelector('.editor-toolbar')),
      hasStatusBar: Boolean(document.querySelector('.status-bar')),
      paperWidth: Math.round(document.querySelector('.editor-paper')?.getBoundingClientRect().width ?? 0),
      blocks: document.querySelectorAll('.shizhi-editor > *').length,
    });
  })()`)

  results.companion = await session.evaluate(`JSON.stringify({
    style: localStorage.getItem('shizhi.companion-style'),
    navMascot: Boolean(document.querySelector('.companion-card .shizhi-mascot')),
  })`)

  results.home = await session.evaluate(`(async () => {
    document.querySelector('[data-nav=home]').click();
    await new Promise((r) => setTimeout(r, 1300));
    return JSON.stringify({
      heading: document.querySelector('#home-heading')?.textContent,
      heatmap: Boolean(document.querySelector('.heatmap-card')),
      streak: document.querySelector('.heatmap-stat strong')?.textContent,
      mascot: Boolean(document.querySelector('.home-companion .shizhi-mascot')),
      statCards: document.querySelectorAll('.home-stat').length,
    });
  })()`)

  results.contextMenu = await session.evaluate(`(async () => {
    document.querySelector('[data-nav=library]').click();
    await new Promise((r) => setTimeout(r, 1400));
    const row = document.querySelector('.recent-item');
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 330, clientY: 470 }));
    await new Promise((r) => setTimeout(r, 400));
    const items = [...document.querySelectorAll('.context-menu .context-item')].map((node) => node.textContent.trim());
    return JSON.stringify({ opened: Boolean(document.querySelector('.context-menu')), items });
  })()`)

  results.renameViaMenu = await session.evaluate(`(async () => {
    const rename = [...document.querySelectorAll('.context-item')].find((node) => node.textContent.includes('重命名'));
    if (!rename) return JSON.stringify({ ok: false, reason: 'no rename entry' });
    rename.click();
    await new Promise((r) => setTimeout(r, 500));
    const input = document.querySelector('.prompt-dialog input');
    if (!input) return JSON.stringify({ ok: false, reason: 'no dialog' });
    input.value = '冒烟重命名';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.prompt-submit').click();
    await new Promise((r) => setTimeout(r, 1500));
    const list = await window.shizhi.documents.list();
    return JSON.stringify({ ok: true, titles: list.map((d) => d.title) });
  })()`)

  results.foldAndLineNumbers = await session.evaluate(`(async () => {
    localStorage.setItem('shizhi.show-line-numbers', 'true');
    localStorage.setItem('shizhi.indent-guides', 'true');
    localStorage.setItem('shizhi.hanging-indent', 'true');
    return 'queued';
  })()`)
  await session.send('Page.reload', { ignoreCache: true })
  await sleep(3500)

  results.editorFeatures = await session.evaluate(`(async () => {
    document.querySelector('[data-nav=library]').click();
    await new Promise((r) => setTimeout(r, 1800));
    const editorClass = document.querySelector('.shizhi-editor')?.className ?? '';
    const foldButtons = document.querySelectorAll('.fold-button').length;
    const lineNumbers = document.querySelectorAll('.block-number').length;
    const firstFold = document.querySelector('.fold-button');
    if (firstFold) firstFold.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 600));
    return JSON.stringify({
      editorClass,
      foldButtons,
      lineNumbers,
      foldedBlocks: document.querySelectorAll('.is-folded').length,
      outlineItems: document.querySelectorAll('.outline-item').length,
    });
  })()`)

  results.languageSwitch = await session.evaluate(`(async () => {
    document.querySelector('[data-nav=settings]').click();
    await new Promise((r) => setTimeout(r, 800));
    const english = [...document.querySelectorAll('.segmented button')].find((b) => b.textContent.trim() === 'English');
    english?.click();
    await new Promise((r) => setTimeout(r, 900));
    const en = [...document.querySelectorAll('.navigation-label')].map((n) => n.textContent.trim());
    const zh = [...document.querySelectorAll('.segmented button')].find((b) => b.textContent.trim() === '简体中文');
    zh?.click();
    await new Promise((r) => setTimeout(r, 900));
    const backToZh = [...document.querySelectorAll('.navigation-label')].map((n) => n.textContent.trim());
    return JSON.stringify({ en, backToZh });
  })()`)

  results.settingsSections = await session.evaluate(`(async () => {
    document.querySelector('[data-settings-section=editor]').click();
    await new Promise((r) => setTimeout(r, 300));
    const editorRows = document.querySelectorAll('.settings-group .settings-row').length;
    document.querySelector('[data-settings-section=appearance]').click();
    await new Promise((r) => setTimeout(r, 300));
    const swatches = document.querySelectorAll('.accent-swatch').length;
    const companionOptions = document.querySelectorAll('.companion-option').length;
    document.querySelector('[data-settings-section=shortcuts]').click();
    await new Promise((r) => setTimeout(r, 300));
    const shortcuts = document.querySelectorAll('.shortcut-key').length;
    return JSON.stringify({ editorRows, swatches, companionOptions, shortcuts });
  })()`)

  results.updateCheck = await session.evaluate(`window.shizhi.update.check(null).then((r) => JSON.stringify(r))`)

  results.errors = JSON.stringify(session.errors)
  session.close()
  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
