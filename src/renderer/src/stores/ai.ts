import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_AI_CONFIG_VIEW,
  isAiConfigured,
  textMessage,
  type AiBlock,
  type AiChatEvent,
  type AiChatResult,
  type AiConfigPatch,
  type AiConfigView,
  type AiMessage,
  type AiTestFailureCode,
  type AiToolCallRecord,
} from '../../../shared/ai'
import type { AiPermissionMode, AiToolDanger } from '../../../shared/aiTools'
import { getShizhiApi } from '../services/api'

/** One tool call as the transcript renders it. */
export interface AiToolCallView {
  toolUseId: string
  name: string
  input: unknown
  danger: AiToolDanger
  status: 'running' | 'approval' | 'ok' | 'error' | 'denied'
  output: string
  /** What the approval card shows; set when `status` is 'approval'. */
  preview: string
}

export interface AiTurn {
  role: 'user' | 'assistant'
  content: string
  /** Streaming state of an assistant turn; user turns are always 'done'. */
  status: 'streaming' | 'done' | 'error' | 'aborted'
  error?: string
  /** Tool calls this turn made, in the order they were requested. */
  toolCalls: AiToolCallView[]
}

export interface AiApprovalItem {
  requestId: string
  toolUseId: string
  name: string
  input: unknown
  danger: AiToolDanger
  preview: string
}

export interface AiConversation {
  id: string
  title: string
  turns: AiTurn[]
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'shizhi.ai-conversations'
const MAX_CONVERSATIONS = 40
/** Older turns are dropped from the request, not from the transcript. */
const MAX_CONTEXT_TURNS = 20
/** Persisted tool output is truncated: transcripts are not meant to be a cache. */
const MAX_PERSISTED_TOOL_OUTPUT = 4000

/**
 * Assistant state: connection settings, the conversation list and the
 * in-flight stream.
 *
 * The key is never read back from the main process — `hasApiKey` is all the
 * renderer knows — so `saveConfig` sends a new key only when the user typed
 * one, and an untouched field keeps the stored value.
 */
export const useAiStore = defineStore('ai', () => {
  const api = getShizhiApi()
  const config = ref<AiConfigView>({ ...DEFAULT_AI_CONFIG_VIEW })
  const conversations = ref<AiConversation[]>(readConversations())
  const activeId = ref<string | null>(conversations.value[0]?.id ?? null)
  const loaded = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const streamingId = ref<string | null>(null)
  const error = ref<string | null>(null)
  /** Calls blocked on the user; the workbench panel and the transcript share it. */
  const pendingApprovals = ref<AiApprovalItem[]>([])

  const active = computed(() =>
    conversations.value.find((conversation) => conversation.id === activeId.value) ?? null)
  const configured = computed(() => isAiConfigured({
    ...config.value,
    apiKey: config.value.hasApiKey ? 'stored' : '',
  }))
  const streaming = computed(() => streamingId.value !== null)

  let disposeEvents: (() => void) | null = null
  let currentRequestId: string | null = null

  async function loadConfig(): Promise<void> {
    if (loaded.value) return
    try {
      config.value = await api.ai.getConfig()
      loaded.value = true
    } catch (cause) {
      error.value = messageOf(cause)
    }
  }

  /** Saves the settings; `apiKey === ''` leaves the stored key untouched. */
  async function saveConfig(patch: AiConfigPatch): Promise<boolean> {
    saving.value = true
    try {
      config.value = await api.ai.saveConfig(patch)
      error.value = null
      return true
    } catch (cause) {
      error.value = messageOf(cause)
      return false
    } finally {
      saving.value = false
    }
  }

  async function testConnection(): Promise<{ ok: boolean; message?: string; code?: AiTestFailureCode }> {
    testing.value = true
    try {
      return await api.ai.test()
    } catch (cause) {
      return { ok: false, message: messageOf(cause) }
    } finally {
      testing.value = false
    }
  }

  function newConversation(): AiConversation {
    const now = new Date().toISOString()
    const conversation: AiConversation = {
      id: crypto.randomUUID(),
      title: '',
      turns: [],
      createdAt: now,
      updatedAt: now,
    }
    conversations.value = [conversation, ...conversations.value].slice(0, MAX_CONVERSATIONS)
    activeId.value = conversation.id
    persist()
    return conversation
  }

  function selectConversation(id: string): void {
    if (streamingId.value) return
    activeId.value = conversations.value.some((conversation) => conversation.id === id) ? id : null
  }

  function deleteConversation(id: string): void {
    if (streamingId.value) return
    conversations.value = conversations.value.filter((conversation) => conversation.id !== id)
    if (activeId.value === id) activeId.value = conversations.value[0]?.id ?? null
    persist()
  }

  function clearActive(): void {
    const conversation = active.value
    if (!conversation) return
    conversation.turns = []
    conversation.title = ''
    conversation.updatedAt = new Date().toISOString()
    persist()
  }

  /**
   * Sends `text` as the next user turn and streams the reply into the active
   * conversation, creating one when none is open.
   */
  async function send(text: string): Promise<void> {
    const content = text.trim()
    if (!content || streaming.value) return
    const conversation = active.value ?? newConversation()
    const now = new Date().toISOString()
    conversation.turns.push({ role: 'user', content, status: 'done', toolCalls: [] })
    if (!conversation.title) conversation.title = content.slice(0, 40)
    conversation.turns.push({ role: 'assistant', content: '', status: 'streaming', toolCalls: [] })
    conversation.updatedAt = now
    // Read the turn back through the array: `turns` is deeply reactive, so the
    // object literal we pushed is not the proxy the UI renders. Mutating the
    // literal would stream into nothing.
    const reply = conversation.turns[conversation.turns.length - 1]!
    persist()

    const conversationId = conversation.id
    const requestId = crypto.randomUUID()
    currentRequestId = requestId
    streamingId.value = conversation.id
    error.value = null
    disposeEvents?.()
    disposeEvents = api.ai.onEvent((event) => handleEvent(event, conversationId, reply, requestId))

    try {
      const result = await api.ai.chat({ requestId, messages: buildContext(conversation) })
      // The reply that resolved is authoritative. Streamed deltas may still be
      // queued behind it (IPC orders the invoke reply against `send` events
      // neither way), so take whatever arrived and let the shorter one win as
      // duplicate-free by preferring the resolved text.
      reconcile(conversationId, reply, result)
    } catch (cause) {
      finish(conversationId, reply, 'error', messageOf(cause))
    } finally {
      if (currentRequestId === requestId) {
        currentRequestId = null
        streamingId.value = null
        disposeEvents?.()
        disposeEvents = null
        // A reply that never streamed anything (or was stopped early) must not
        // leave a permanently "streaming" bubble behind.
        if (reply.status === 'streaming') finish(conversationId, reply, reply.content ? 'done' : 'aborted')
      }
    }
  }

  /**
   * Applies the resolved reply.
   *
   * `result.text` is the complete stream, so it wins over whatever the events
   * managed to deliver. Events that arrive after this are dropped by the
   * request-id check — they can only repeat text already here.
   *
   * Tool cards are re-based on the resolved records too: a run that resolved
   * while an approval event was still in flight would otherwise leave a card
   * stuck on "waiting".
   */
  function reconcile(conversationId: string, reply: AiTurn, result: AiChatResult): void {
    const textChanged = result.text.length > reply.content.length
    if (textChanged) {
      reply.content = result.text
      touch(conversationId)
    }
    applyToolRecords(reply, result.toolCalls)
    if (result.error) finish(conversationId, reply, 'error', result.error)
    // Statuses set by an event (`aborted`, `error`) are already final.
    else if (reply.status === 'streaming') finish(conversationId, reply, result.aborted ? 'aborted' : 'done')
    else if (textChanged) persist()
  }

  /** Overlays the authoritative call outcomes onto the cards already shown. */
  function applyToolRecords(reply: AiTurn, records: readonly AiToolCallRecord[] | undefined): void {
    if (!Array.isArray(records)) return
    for (const record of records) {
      const card = reply.toolCalls.find((call) => call.toolUseId === record.toolUseId)
      if (card) {
        card.status = record.status
        card.output = record.output
        continue
      }
      // No matching card (events lost or reordered): add it so the transcript
      // still reflects what actually ran.
      reply.toolCalls.push({
        toolUseId: record.toolUseId,
        name: record.name,
        input: record.input,
        danger: 'read',
        status: record.status,
        output: record.output,
        preview: '',
      })
    }
  }

  async function stop(): Promise<void> {
    if (!currentRequestId) return
    // A run waiting on approval never resolves on its own; deny it here so the
    // loop can unwind instead of leaving the next prompt queued forever.
    for (const item of pendingApprovals.value) {
      await api.ai.approve(item.requestId, item.toolUseId, 'deny').catch(() => undefined)
    }
    pendingApprovals.value = []
    await api.ai.cancel(currentRequestId).catch(() => undefined)
  }

  /** Opens a parked approval and clears it from the queue. */
  async function respondApproval(item: AiApprovalItem, decision: 'allow' | 'deny', remember = false): Promise<void> {
    pendingApprovals.value = pendingApprovals.value.filter((entry) => entry.toolUseId !== item.toolUseId)
    await api.ai.approve(item.requestId, item.toolUseId, decision, remember).catch(() => undefined)
  }

  /** Wraps the directory picker so the workbench does not reach for `api`. */
  async function pickWorkspace(): Promise<string | null> {
    return api.workspace.pick().catch(() => null)
  }

  /** Reveals a folder in the OS file manager. */
  async function openPath(target: string): Promise<void> {
    if (!target) return
    await api.workspace.reveal(target).catch(() => undefined)
  }

  function handleEvent(event: AiChatEvent, conversationId: string, reply: AiTurn, requestId: string): void {
    if (event.requestId !== currentRequestId) return
    if (event.type === 'delta') {
      reply.content += event.text
      touch(conversationId)
      return
    }
    if (event.type === 'tool_call') {
      // The card is added on the call event; `tool_result` later fills it in.
      if (!reply.toolCalls.some((call) => call.toolUseId === event.toolUseId)) {
        reply.toolCalls.push({
          toolUseId: event.toolUseId,
          name: event.name,
          input: event.input,
          danger: 'read',
          status: 'running',
          output: '',
          preview: '',
        })
        touch(conversationId)
      }
      return
    }
    if (event.type === 'approval') {
      // The approval event can arrive before `tool_call` if sends interleave;
      // either way exactly one card must exist for the call id.
      let card = reply.toolCalls.find((call) => call.toolUseId === event.toolUseId)
      if (!card) {
        card = {
          toolUseId: event.toolUseId,
          name: event.name,
          input: event.input,
          danger: event.danger,
          status: 'approval',
          output: '',
          preview: event.preview,
        }
        reply.toolCalls.push(card)
      }
      card.status = 'approval'
      card.danger = event.danger
      card.preview = event.preview
      pendingApprovals.value = [
        ...pendingApprovals.value,
        { requestId, toolUseId: event.toolUseId, name: event.name, input: event.input, danger: event.danger, preview: event.preview },
      ]
      touch(conversationId)
      return
    }
    if (event.type === 'tool_result') {
      const card = reply.toolCalls.find((call) => call.toolUseId === event.toolUseId)
      if (card) {
        card.status = event.status
        card.output = event.output
      }
      pendingApprovals.value = pendingApprovals.value.filter((entry) => entry.toolUseId !== event.toolUseId)
      touch(conversationId)
      return
    }
    if (event.type === 'done') {
      // Only the event stream says "aborted" here; `reconcile` handles the
      // authoritative completion once `chat()` resolves.
      if (event.aborted) finish(conversationId, reply, 'aborted')
      return
    }
    if (event.type === 'error') {
      // Whatever streamed before the failure is kept: it is often useful.
      finish(conversationId, reply, 'error', event.message)
    }
  }

  function finish(conversationId: string, reply: AiTurn, status: AiTurn['status'], errorMessage?: string): void {
    reply.status = status
    if (errorMessage) reply.error = errorMessage
    const conversation = conversations.value.find((item) => item.id === conversationId)
    if (conversation) conversation.updatedAt = new Date().toISOString()
    persist()
  }

  function touch(conversationId: string): void {
    const conversation = conversations.value.find((item) => item.id === conversationId)
    if (!conversation) return
    conversation.updatedAt = new Date().toISOString()
    // Persisting on every delta would write the whole list dozens of times per
    // reply; the final state is written by `finish`.
  }

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.value
        .slice(0, MAX_CONVERSATIONS)
        .map((conversation) => ({
          ...conversation,
          turns: conversation.turns.map((turn) => ({
            ...turn,
            // Tool output is deliberately clipped: it is the part that grows
            // without bound, and a stale transcript only needs a hint of it.
            toolCalls: turn.toolCalls.map((call) => ({
              ...call,
              output: call.output.slice(0, MAX_PERSISTED_TOOL_OUTPUT),
            })),
          })),
        }))))
    } catch {
      // A full quota must not break the assistant; the in-memory list survives.
    }
  }

  /**
   * Builds the conversation the model sees.
   *
   * Tool calls are not replayed: the run's transcript lives in the store, and
   * sending stale tool results back would confuse a fresh run. History is plain
   * text turns only, which is also what keeps the context small.
   */
  function buildContext(conversation: AiConversation): AiMessage[] {
    return conversation.turns
      .filter((turn) => turn.role === 'user' || (turn.role === 'assistant' && turn.content))
      .slice(-MAX_CONTEXT_TURNS)
      .map((turn) => textMessage(turn.role, turn.content))
  }

  return {
    config,
    conversations,
    activeId,
    active,
    configured,
    streaming,
    saving,
    testing,
    error,
    pendingApprovals,
    loadConfig,
    saveConfig,
    testConnection,
    newConversation,
    selectConversation,
    deleteConversation,
    clearActive,
    send,
    stop,
    respondApproval,
    pickWorkspace,
    openPath,
  }
})

function readConversations(): AiConversation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const candidate = item as Partial<AiConversation>
      if (typeof candidate.id !== 'string' || !Array.isArray(candidate.turns)) return []
      const turns = candidate.turns.flatMap((turn) => {
        if (!turn || typeof turn !== 'object') return []
        const entry = turn as Partial<AiTurn>
        if ((entry.role !== 'user' && entry.role !== 'assistant') || typeof entry.content !== 'string') return []
        // A conversation restored after a crash must not look mid-stream, and a
        // call that was running then cannot be resumed — mark it failed.
        return [{
          role: entry.role,
          content: entry.content,
          status: entry.role === 'user' ? 'done' : (entry.status === 'error' || entry.status === 'aborted' ? entry.status : 'done'),
          ...(typeof entry.error === 'string' ? { error: entry.error } : {}),
          toolCalls: readToolCalls(entry.toolCalls),
        } satisfies AiTurn]
      })
      return [{
        id: candidate.id,
        title: typeof candidate.title === 'string' ? candidate.title : '',
        turns,
        createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
        updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
      } satisfies AiConversation]
    })
  } catch {
    return []
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : String(cause)
}

/** Restores tool cards, downgrading anything that was unfinished. */
function readToolCalls(value: unknown): AiToolCallView[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const call = item as Partial<AiToolCallView>
    if (typeof call.toolUseId !== 'string' || typeof call.name !== 'string') return []
    const status = call.status
    return [{
      toolUseId: call.toolUseId,
      name: call.name,
      input: call.input,
      danger: call.danger === 'write' || call.danger === 'execute' ? call.danger : 'read',
      status: status === 'ok' || status === 'error' || status === 'denied' ? status : 'error',
      output: typeof call.output === 'string' ? call.output : '',
      preview: typeof call.preview === 'string' ? call.preview : '',
    } satisfies AiToolCallView]
  })
}
