import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { AiChatEvent, AiChatResult } from '../src/shared/ai'

/**
 * Regression cover for the truncated-reply bug.
 *
 * The reply promise and the streamed events travel over two IPC paths and
 * Electron does not order them: the invoke reply can land before the last
 * `send`. The store must therefore treat the resolved value as authoritative,
 * no matter how few deltas arrived first.
 */

type Handler = (event: AiChatEvent) => void

const handlers: Handler[] = []
let sentRequestId = ''
let chatResult: () => Promise<AiChatResult> = async () => ({ text: '', toolCalls: [], aborted: false })

vi.mock('../src/renderer/src/services/api', () => ({
  getShizhiApi: () => ({
    ai: {
      getConfig: async () => ({
        protocol: 'anthropic',
        baseUrl: 'http://cch.example.io',
        model: 'demo-model',
        temperature: 0.7,
        maxTokens: 8192,
        systemPrompt: '',
        hasApiKey: true,
      }),
      saveConfig: async (patch: unknown) => patch,
      test: async () => ({ ok: true }),
      chat: (request: { requestId: string }) => {
        sentRequestId = request.requestId
        return chatResult()
      },
      cancel: async () => undefined,
      approve: async () => undefined,
      onEvent: (handler: Handler) => {
        handlers.push(handler)
        return () => {
          const index = handlers.indexOf(handler)
          if (index >= 0) handlers.splice(index, 1)
        }
      },
      onDocumentsChanged: () => () => undefined,
    },
    workspace: { pick: async () => null },
  }),
}))

const { useAiStore } = await import('../src/renderer/src/stores/ai')

function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() { return entries.size },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => { entries.delete(key) },
    setItem: (key, value) => { entries.set(key, value) },
  }
}

/** Resolves `chat()` only when the test says so. */
function deferred(): { promise: Promise<AiChatResult>; resolve: (value: AiChatResult) => void } {
  let resolve: (value: AiChatResult) => void = () => undefined
  const promise = new Promise<AiChatResult>((done) => { resolve = done })
  return { promise, resolve }
}

describe('assistant streaming', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', memoryStorage())
    handlers.length = 0
    sentRequestId = ''
    chatResult = async () => ({ text: '', toolCalls: [], aborted: false })
  })

  it('shows the whole reply even when only the first delta arrives before the promise', async () => {
    const store = useAiStore()
    await store.loadConfig()
    const pending = deferred()
    chatResult = () => pending.promise

    const sending = store.send('你能读取到当前有哪些文档吗')
    await Promise.resolve()
    await Promise.resolve()

    const emit = handlers.at(-1)!
    emit({ requestId: sentRequestId, type: 'delta', text: '我' })
    await nextTick()
    expect(store.active!.turns.at(-1)!.content).toBe('我')

    // The promise wins the race: every remaining delta is still queued behind it.
    pending.resolve({ text: '我不能直接读取你当前环境里有哪些文档。', toolCalls: [], aborted: false })
    await sending

    const reply = store.active!.turns.at(-1)!
    expect(reply.content).toBe('我不能直接读取你当前环境里有哪些文档。')
    expect(reply.status).toBe('done')
  })

  it('does not duplicate text when the deltas do arrive first', async () => {
    const store = useAiStore()
    await store.loadConfig()
    const pending = deferred()
    chatResult = () => pending.promise

    const sending = store.send('hi')
    await Promise.resolve()
    await Promise.resolve()
    const emit = handlers.at(-1)!
    const parts = ['你', '好', '，', '世界']
    for (const text of parts) emit({ requestId: sentRequestId, type: 'delta', text })
    pending.resolve({ text: parts.join(''), toolCalls: [], aborted: false })
    await sending

    expect(store.active!.turns.at(-1)!.content).toBe('你好，世界')
  })

  it('ignores deltas that arrive after the reply resolved', async () => {
    const store = useAiStore()
    await store.loadConfig()
    chatResult = async () => ({ text: '完整回复', toolCalls: [], aborted: false })

    await store.send('hi')
    const late = handlers.at(-1)
    late?.({ requestId: sentRequestId, type: 'delta', text: '重复' })

    expect(store.active!.turns.at(-1)!.content).toBe('完整回复')
  })

  it('reports a stream failure carried by the resolved value', async () => {
    const store = useAiStore()
    await store.loadConfig()
    chatResult = async () => ({ text: '前一半', aborted: false, toolCalls: [], error: 'connection reset', errorCode: 'network' })

    await store.send('hi')
    const reply = store.active!.turns.at(-1)!
    expect(reply.content).toBe('前一半')
    expect(reply.status).toBe('error')
    expect(reply.error).toBe('connection reset')
  })

  it('marks a stopped reply as aborted and keeps what streamed', async () => {
    const store = useAiStore()
    await store.loadConfig()
    const pending = deferred()
    chatResult = () => pending.promise

    const sending = store.send('hi')
    await Promise.resolve()
    await Promise.resolve()
    handlers.at(-1)!({ requestId: sentRequestId, type: 'delta', text: '写了一半' })
    pending.resolve({ text: '写了一半', toolCalls: [], aborted: true })
    await sending

    const reply = store.active!.turns.at(-1)!
    expect(reply.content).toBe('写了一半')
    expect(reply.status).toBe('aborted')
  })
})
